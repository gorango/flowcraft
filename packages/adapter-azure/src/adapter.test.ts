import { Buffer } from 'node:buffer'
import { ConnectionMode, CosmosClient } from '@azure/cosmos'
import { QueueClient, QueueServiceClient } from '@azure/storage-queue'
import type { StartedAzuriteContainer } from '@testcontainers/azurite'
import { AzuriteContainer } from '@testcontainers/azurite'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { RedisContainer } from '@testcontainers/redis'
import type { JobPayload, PatchOperation } from 'flowcraft'
import Redis from 'ioredis'
import type { StartedTestContainer } from 'testcontainers'
import { GenericContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AzureQueueAdapter } from './adapter'
import { CosmosDbContext } from './context'
import { RedisCoordinationStore } from './store'

const QUEUE_NAME = 'flowcraft-jobs-queue'
const COSMOS_DB = 'flowcraft-db'
const CONTEXT_CONTAINER = 'contexts'
const STATUS_CONTAINER = 'statuses'

async function retry<T>(operation: () => Promise<T>, retries = 12, delay = 5000): Promise<T> {
	let lastError: any
	for (let i = 0; i < retries; i++) {
		try {
			return await operation()
		} catch (error: any) {
			lastError = error
			const isPgCosmosStarting =
				typeof error?.message === 'string' &&
				error.message.includes('pgcosmos extension is still starting')
			if (
				error.code === 'ECONNRESET' ||
				error.code === 'ECONNREFUSED' ||
				error.code === 'ETIMEDOUT' ||
				isPgCosmosStarting
			) {
				console.error(
					`Attempt ${i + 1} failed with ${error.code ?? 'pgcosmos starting'}. Retrying in ${delay}ms...`,
				)
				await new Promise((res) => setTimeout(res, delay))
			} else {
				throw error
			}
		}
	}
	throw lastError
}

describe('AzureQueueAdapter - Testcontainers Integration', () => {
	let azuriteContainer: StartedAzuriteContainer | undefined
	let redisContainer: StartedRedisContainer | undefined
	let cosmosContainer: StartedTestContainer | undefined

	let queueClient: QueueClient
	let cosmosClient: CosmosClient
	let redis: Redis

	beforeAll(async () => {
		console.log('Starting all containers...')
		;[azuriteContainer, redisContainer, cosmosContainer] = await Promise.all([
			new AzuriteContainer('mcr.microsoft.com/azure-storage/azurite:3.35.0')
				.withSkipApiVersionCheck()
				.start(),
			new RedisContainer('redis:8.2.2').start(),
			new GenericContainer('mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-preview')
				.withExposedPorts({ container: 8081, host: 8081 })
				.withResourcesQuota({ memory: 3 * 1024 * 1024 * 1024 })
				.withEnvironment({
					AZURE_COSMOS_EMULATOR_PARTITION_COUNT: '3',
					AZURE_COSMOS_EMULATOR_ENABLE_DATA_PERSISTENCE: 'false',
					AZURE_COSMOS_EMULATOR_IP_ADDRESS_OVERRIDE: '127.0.0.1',
					AZURE_COSMOS_EMULATOR_ENABLE_EXPLORER: 'true',
					AZURE_COSMOS_EMULATOR_PORT: '8081',
				})
				.withWaitStrategy(Wait.forListeningPorts().withStartupTimeout(180_000))
				.start(),
		])
		console.log('All containers started.')

		const azuriteConn = azuriteContainer.getConnectionString()
		const queueService = QueueServiceClient.fromConnectionString(azuriteConn)
		queueClient = queueService.getQueueClient(QUEUE_NAME)
		await queueClient.create()
		console.log('Azurite queue client created and queue is ready.')

		console.log('Attempting to connect to Cosmos DB with retry logic...')
		await retry(async () => {
			const cosmosHost = cosmosContainer?.getHost()
			const cosmosPort = 8081
			if (!cosmosHost) {
				throw new Error('Cosmos DB host/port not available')
			}
			const cosmosEndpoint = `http://${cosmosHost}:${cosmosPort}`
			console.log(`Retry attempt: Connecting to Cosmos DB endpoint: ${cosmosEndpoint}`)

			cosmosClient = new CosmosClient({
				endpoint: cosmosEndpoint,
				key: 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==',
				connectionPolicy: {
					requestTimeout: 10000,
					connectionMode: ConnectionMode.Gateway,
					enableEndpointDiscovery: false,
				},
			})
			const { database } = await cosmosClient.databases.createIfNotExists({
				id: COSMOS_DB,
			})
			await database.containers.createIfNotExists({
				id: CONTEXT_CONTAINER,
				partitionKey: { paths: ['/runId'] },
			})
			await database.containers.createIfNotExists({
				id: STATUS_CONTAINER,
				partitionKey: { paths: ['/runId'] },
			})
		})
		console.log('Successfully connected to Cosmos DB and created database/containers.')

		redis = new Redis(redisContainer.getConnectionUrl())
		console.log('Redis client connected.')
	}, 180_000)

	afterAll(async () => {
		console.log('Stopping all containers...')
		await Promise.all([azuriteContainer?.stop(), redisContainer?.stop(), cosmosContainer?.stop()])
		console.log('All containers stopped.')
	})

	it('should successfully enqueue a job into the Azurite queue', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new AzureQueueAdapter({
			queueClient,
			cosmosClient,
			cosmosDatabaseName: COSMOS_DB,
			contextContainerName: CONTEXT_CONTAINER,
			statusContainerName: STATUS_CONTAINER,
			coordinationStore,
			runtimeOptions: {},
		})

		const job: JobPayload = {
			runId: 'run-azure-456',
			blueprintId: 'bp-azure',
			nodeId: 'node-azure-start',
		}

		await (adapter as any).enqueueJob(job)
		const response = await queueClient.receiveMessages({
			numberOfMessages: 1,
		})
		expect(response.receivedMessageItems).toHaveLength(1)
		const message = response.receivedMessageItems[0]
		const receivedJob = JSON.parse(Buffer.from(message.messageText, 'base64').toString())
		expect(receivedJob).toEqual(job)
	})

	it('should support delta-based persistence with patch operations', async () => {
		const runId = 'test-delta-run'
		const context = new CosmosDbContext(runId, {
			client: cosmosClient,
			databaseName: COSMOS_DB,
			containerName: CONTEXT_CONTAINER,
		})

		// Set initial data
		await context.set('user', { id: 1, name: 'Alice' })
		await context.set('count', 5)
		await context.set('items', ['a', 'b', 'c'])

		// Verify initial state
		expect(await context.get('user')).toEqual({ id: 1, name: 'Alice' })
		expect(await context.get('count')).toBe(5)
		expect(await context.get('items')).toEqual(['a', 'b', 'c'])

		// Apply patch operations
		const operations: PatchOperation[] = [
			{ op: 'set', key: 'user', value: { id: 1, name: 'Alice Updated' } },
			{ op: 'set', key: 'count', value: 10 },
			{ op: 'delete', key: 'items' },
			{ op: 'set', key: 'status', value: 'completed' },
		]

		await context.patch(operations)

		// Verify patched state
		expect(await context.get('user')).toEqual({ id: 1, name: 'Alice Updated' })
		expect(await context.get('count')).toBe(10)
		expect(await context.get('items')).toBeUndefined()
		expect(await context.get('status')).toBe('completed')

		// Verify full state
		const fullState = await context.toJSON()
		expect(fullState).toEqual({
			user: { id: 1, name: 'Alice Updated' },
			count: 10,
			status: 'completed',
		})
	})

	it('should run a full job workflow with lifecycle methods', async () => {
		const runId = 'test-workflow-run'
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new AzureQueueAdapter({
			queueClient,
			cosmosClient,
			cosmosDatabaseName: COSMOS_DB,
			contextContainerName: CONTEXT_CONTAINER,
			statusContainerName: STATUS_CONTAINER,
			coordinationStore,
			runtimeOptions: {
				blueprints: {
					testBlueprint: {
						id: 'testBlueprint',
						nodes: [
							{ id: 'A', uses: 'testAction' },
							{ id: 'B', uses: 'testAction' },
						],
						edges: [{ source: 'A', target: 'B' }],
					},
				},
				registry: {
					testAction: async () => ({ output: 'done' }),
				},
			},
		})

		const job: JobPayload = {
			runId,
			blueprintId: 'testBlueprint',
			nodeId: 'A',
		}

		await (adapter as any).enqueueJob(job)

		await (adapter as any).onJobStart(runId, 'testBlueprint', 'A')
		const statusContext = new CosmosDbContext(runId, {
			client: cosmosClient,
			databaseName: COSMOS_DB,
			containerName: STATUS_CONTAINER,
		})
		const statusValue = await statusContext.get('status' as any)
		expect(statusValue).toBe('running')

		await (adapter as any).publishFinalResult(runId, {
			status: 'completed',
		})

		const finalStatus = await statusContext.get('status' as any)
		expect(finalStatus).toBe('completed')
	})

	it('should use createContext to build context for a run', async () => {
		const adapter = new AzureQueueAdapter({
			queueClient,
			cosmosClient,
			cosmosDatabaseName: COSMOS_DB,
			contextContainerName: CONTEXT_CONTAINER,
			statusContainerName: STATUS_CONTAINER,
			coordinationStore: new RedisCoordinationStore(redis),
			runtimeOptions: {},
		})

		const context = (adapter as any).createContext('runCtxTest')
		expect(context).toBeInstanceOf(CosmosDbContext)
	})

	it('should reject registerWebhookEndpoint as not implemented', async () => {
		const adapter = new AzureQueueAdapter({
			queueClient,
			cosmosClient,
			cosmosDatabaseName: COSMOS_DB,
			contextContainerName: CONTEXT_CONTAINER,
			statusContainerName: STATUS_CONTAINER,
			coordinationStore: new RedisCoordinationStore(redis),
			runtimeOptions: {},
		})

		const context = (adapter as any).createContext('runCtxTest')
		expect(context).toBeInstanceOf(CosmosDbContext)
	})

	it('should reject registerWebhookEndpoint as not implemented', async () => {
		const adapter = new AzureQueueAdapter({
			queueClient,
			cosmosClient,
			cosmosDatabaseName: COSMOS_DB,
			contextContainerName: CONTEXT_CONTAINER,
			statusContainerName: STATUS_CONTAINER,
			coordinationStore: new RedisCoordinationStore(redis),
			runtimeOptions: {},
		})

		await expect(adapter.registerWebhookEndpoint('run-1', 'node-1')).rejects.toThrow(
			'registerWebhookEndpoint not implemented for AzureAdapter',
		)
	})

	it('should expose handleJob for serverless invocation', async () => {
		const adapter = new AzureQueueAdapter({
			queueClient,
			cosmosClient,
			cosmosDatabaseName: COSMOS_DB,
			contextContainerName: CONTEXT_CONTAINER,
			statusContainerName: STATUS_CONTAINER,
			coordinationStore: new RedisCoordinationStore(redis),
			runtimeOptions: {
				blueprints: {
					handleJobTest: {
						id: 'handleJobTest',
						nodes: [{ id: 'X', uses: 'noop' }],
						edges: [],
					},
				},
				registry: {
					noop: async () => ({ output: 'ok' }),
				},
			},
		})

		expect(typeof adapter.handleJob).toBe('function')
	})
}, 240_000)

import { Buffer } from 'node:buffer'
import https from 'node:https'
import { CosmosClient } from '@azure/cosmos'
import { QueueClient } from '@azure/storage-queue'
import type { StartedAzuriteContainer } from '@testcontainers/azurite'
import { AzuriteContainer } from '@testcontainers/azurite'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { RedisContainer } from '@testcontainers/redis'
import type { JobPayload } from 'flowcraft'
import Redis from 'ioredis'
import type { StartedTestContainer } from 'testcontainers'
import { GenericContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AzureQueueAdapter } from './adapter'
import { RedisCoordinationStore } from './store'

const QUEUE_NAME = 'flowcraft-jobs-queue'
const COSMOS_DB = 'flowcraft-db'
const CONTEXT_CONTAINER = 'contexts'
const STATUS_CONTAINER = 'statuses'

async function retry<T>(operation: () => Promise<T>, retries = 5, delay = 3000): Promise<T> {
	let lastError: any
	for (let i = 0; i < retries; i++) {
		try {
			return await operation()
		} catch (error: any) {
			lastError = error
			if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
				console.error(`Attempt ${i + 1} failed with ${error.code}. Retrying in ${delay}ms...`)
				await new Promise((res) => setTimeout(res, delay))
			} else {
				throw error
			}
		}
	}
	throw lastError
}

describe.skip(
	'AzureQueueAdapter - Testcontainers Integration',
	() => {
		let azuriteContainer: StartedAzuriteContainer | undefined
		let redisContainer: StartedRedisContainer | undefined
		let cosmosContainer: StartedTestContainer | undefined

		let queueClient: QueueClient
		let cosmosClient: CosmosClient
		let redis: Redis

		beforeAll(async () => {
			console.log('Starting all containers...')
			;[azuriteContainer, redisContainer, cosmosContainer] = await Promise.all([
				new AzuriteContainer('mcr.microsoft.com/azure-storage/azurite:latest').start(),
				new RedisContainer('redis:latest').start(),
				new GenericContainer('mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator')
					.withExposedPorts(8081)
					.withResourcesQuota({ memory: 3 * 1024 * 1024 * 1024 })
					.withEnvironment({
						AZURE_COSMOS_EMULATOR_PARTITION_COUNT: '3',
						AZURE_COSMOS_EMULATOR_ENABLE_DATA_PERSISTENCE: 'false',
						AZURE_COSMOS_EMULATOR_IP_ADDRESS_OVERRIDE: '127.0.0.1',
					})
					.withWaitStrategy(Wait.forLogMessage('Started').withStartupTimeout(180_000))
					.start(),
			])
			console.log('All containers started.')

			const cosmosHost = cosmosContainer?.getHost()
			const cosmosPort = cosmosContainer?.getMappedPort(8081)
			console.log(`Cosmos DB container started. Host: '${cosmosHost}', Mapped Port: '${cosmosPort}'`)

			const azuriteConn = azuriteContainer.getConnectionString()
			queueClient = new QueueClient(azuriteConn, QUEUE_NAME)
			await queueClient.create()
			console.log('Azurite queue client created and queue is ready.')

			console.log('Attempting to connect to Cosmos DB with retry logic...')
			await retry(async () => {
				const cosmosEndpoint = `https://${cosmosHost}:${cosmosPort}`
				console.log(`Retry attempt: Connecting to Cosmos DB endpoint: ${cosmosEndpoint}`)

				cosmosClient = new CosmosClient({
					endpoint: cosmosEndpoint,
					key: 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==',
					connectionPolicy: {
						requestTimeout: 10000,
					},
					agent: new https.Agent({ rejectUnauthorized: false }),
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
		})

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
	},
	{ timeout: 240_000 },
)

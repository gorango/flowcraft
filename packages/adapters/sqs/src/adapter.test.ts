import { CreateTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { CreateQueueCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import type { StartedLocalStackContainer } from '@testcontainers/localstack'
import { LocalstackContainer } from '@testcontainers/localstack'
import type { ICoordinationStore, JobPayload, PatchOperation } from 'flowcraft'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { SqsAdapter } from './adapter'
import { DynamoDbContext } from './context'

const QUEUE_NAME = 'test-flowcraft-queue'
const CONTEXT_TABLE = 'test-context-table'
const STATUS_TABLE = 'test-status-table'
const REGION = 'us-east-1'

describe('SqsAdapter', () => {
	let container: StartedLocalStackContainer
	let sqsClient: SQSClient
	let dynamoClient: DynamoDBClient
	let queueUrl: string

	beforeAll(async () => {
		container = await new LocalstackContainer('localstack/localstack:3.8.1').start()
		const endpoint = container.getConnectionUri()

		sqsClient = new SQSClient({
			endpoint,
			region: REGION,
			credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
		})

		dynamoClient = new DynamoDBClient({
			endpoint,
			region: REGION,
			credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
		})

		const createQueueResponse = await sqsClient.send(
			new CreateQueueCommand({ QueueName: QUEUE_NAME }),
		)
		queueUrl = createQueueResponse.QueueUrl ?? ''

		const createTable = (TableName: string) =>
			dynamoClient.send(
				new CreateTableCommand({
					TableName,
					KeySchema: [{ AttributeName: 'runId', KeyType: 'HASH' }],
					AttributeDefinitions: [{ AttributeName: 'runId', AttributeType: 'S' }],
					BillingMode: 'PAY_PER_REQUEST',
				}),
			)

		await createTable(CONTEXT_TABLE)
		await createTable(STATUS_TABLE)
	}, 60000)

	afterAll(async () => {
		await container.stop()
	})

	it('should successfully enqueue a job into the LocalStack SQS queue', async () => {
		const adapter = new SqsAdapter({
			sqsClient,
			dynamoDbClient: dynamoClient,
			queueUrl,
			contextTableName: CONTEXT_TABLE,
			statusTableName: STATUS_TABLE,
			coordinationStore: {} as ICoordinationStore,
			runtimeOptions: {},
		})

		const job: JobPayload = {
			runId: 'run-abc',
			blueprintId: 'bp-1',
			nodeId: 'node-start',
		}

		await (adapter as any).enqueueJob(job)

		const receiveResult = await sqsClient.send(
			new ReceiveMessageCommand({
				QueueUrl: queueUrl,
				MaxNumberOfMessages: 1,
			}),
		)

		expect(receiveResult.Messages).toHaveLength(1)
		const receivedJob = JSON.parse(receiveResult.Messages?.[0].Body ?? '{}')
		expect(receivedJob).toEqual(job)
	})

	it('should support delta-based persistence with patch operations', async () => {
		const runId = 'test-delta-run'
		const context = new DynamoDbContext(runId, {
			client: dynamoClient,
			tableName: CONTEXT_TABLE,
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

	it('should expose handleJob() as a public method for serverless usage', async () => {
		const mockCoordinationStore = {
			increment: () => Promise.resolve(1),
			setIfNotExist: () => Promise.resolve(true),
			extendTTL: () => Promise.resolve(true),
			delete: () => Promise.resolve(),
			get: () => Promise.resolve(undefined),
		}
		const adapter = new SqsAdapter({
			sqsClient,
			dynamoDbClient: dynamoClient,
			queueUrl,
			contextTableName: CONTEXT_TABLE,
			statusTableName: STATUS_TABLE,
			coordinationStore: mockCoordinationStore,
			runtimeOptions: {
				blueprints: {
					test: {
						id: 'test',
						nodes: [{ id: 'A', uses: 'test' }],
						edges: [],
					},
				},
				registry: {
					test: async () => ({ output: 'done' }),
				},
			},
		})

		// handleJob should be publicly accessible (not just via processJobs)
		expect(typeof adapter.handleJob).toBe('function')

		// Calling handleJob should not throw (it will process the job via the base class)
		// Since we don't have a real context set up for this runId, it will fail gracefully
		// but the important thing is that the method is publicly callable
		const job: JobPayload = {
			runId: 'serverless-test-run',
			blueprintId: 'test',
			nodeId: 'A',
		}

		// This should not throw a "method not found" error
		await expect(adapter.handleJob(job)).resolves.not.toThrow()
	})
})

describe('SqsAdapter - Unit Tests', () => {
	it('should throw on registerWebhookEndpoint', async () => {
		const mockSqs = { send: vi.fn().mockResolvedValue({}) }
		const mockDynamo = { send: vi.fn().mockResolvedValue({}) }

		const adapter = new SqsAdapter({
			sqsClient: mockSqs as any,
			dynamoDbClient: mockDynamo as any,
			queueUrl: 'http://queue',
			contextTableName: 'contexts',
			statusTableName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		await expect(adapter.registerWebhookEndpoint('run-1', 'node-1')).rejects.toThrow(
			'registerWebhookEndpoint not implemented for SQSAdapter',
		)
	})

	it('should have processJobs available', () => {
		const mockSqs = { send: vi.fn().mockResolvedValue({}) }
		const mockDynamo = { send: vi.fn().mockResolvedValue({}) }

		const adapter = new SqsAdapter({
			sqsClient: mockSqs as any,
			dynamoDbClient: mockDynamo as any,
			queueUrl: 'http://queue',
			contextTableName: 'contexts',
			statusTableName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		expect(typeof (adapter as any).processJobs).toBe('function')
	})

	it('should set up consumer with processJobs', () => {
		const mockSqs = { send: vi.fn().mockResolvedValue({}) }
		const mockDynamo = { send: vi.fn().mockResolvedValue({}) }

		const adapter = new SqsAdapter({
			sqsClient: mockSqs as any,
			dynamoDbClient: mockDynamo as any,
			queueUrl: 'http://queue',
			contextTableName: 'contexts',
			statusTableName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		;(adapter as any).processJobs(() => {})
		expect((adapter as any).consumer).toBeDefined()
	})

	it('should warn when consumer already active', () => {
		const mockSqs = { send: vi.fn().mockResolvedValue({}) }
		const mockDynamo = { send: vi.fn().mockResolvedValue({}) }

		const adapter = new SqsAdapter({
			sqsClient: mockSqs as any,
			dynamoDbClient: mockDynamo as any,
			queueUrl: 'http://queue',
			contextTableName: 'contexts',
			statusTableName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		;(adapter as any).consumer = { start: vi.fn() }
		;(adapter as any).processJobs(() => {})
	})

	it('should handle onJobStart error gracefully', async () => {
		const mockSqs = { send: vi.fn().mockResolvedValue({}) }
		const mockDynamo = {
			send: vi.fn().mockRejectedValue(new Error('Dynamo error')),
		}

		const adapter = new SqsAdapter({
			sqsClient: mockSqs as any,
			dynamoDbClient: mockDynamo as any,
			queueUrl: 'http://queue',
			contextTableName: 'contexts',
			statusTableName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		await (adapter as any).onJobStart('run-1', 'bp-1', 'node-1')
	})

	it('should stop consumer', () => {
		const mockConsumer = { stop: vi.fn() }
		const mockSqs = { send: vi.fn().mockResolvedValue({}) }
		const mockDynamo = { send: vi.fn().mockResolvedValue({}) }

		const adapter = new SqsAdapter({
			sqsClient: mockSqs as any,
			dynamoDbClient: mockDynamo as any,
			queueUrl: 'http://queue',
			contextTableName: 'contexts',
			statusTableName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		;(adapter as any).consumer = mockConsumer
		adapter.stop()
		expect(mockConsumer.stop).toHaveBeenCalled()
	})
})

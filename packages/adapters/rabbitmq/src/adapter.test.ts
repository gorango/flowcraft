import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedRabbitMQContainer } from '@testcontainers/rabbitmq'
import { RabbitMQContainer } from '@testcontainers/rabbitmq'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { RedisContainer } from '@testcontainers/redis'
import * as amqplib from 'amqplib'
import type { JobPayload, PatchOperation } from 'flowcraft'
import Redis from 'ioredis'
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { RabbitMqAdapter } from './adapter'
import { PostgresContext } from './context'
import { RedisCoordinationStore } from './store'

const QUEUE_NAME = 'flowcraft-test-queue'
const CONTEXT_TABLE = 'contexts'
const STATUS_TABLE = 'statuses'

describe('RabbitMqAdapter - Testcontainers Integration', () => {
	let rabbitContainer: StartedRabbitMQContainer
	let pgContainer: StartedPostgreSqlContainer
	let redisContainer: StartedRedisContainer

	let amqpConnection: amqplib.Connection
	let pgClient: PgClient
	let redis: Redis

	beforeAll(async () => {
		;[rabbitContainer, pgContainer, redisContainer] = await Promise.all([
			new RabbitMQContainer('rabbitmq:3.13.0-management-alpine').start(),
			new PostgreSqlContainer('postgres:16.4').start(),
			new RedisContainer('redis:8.2.2').start(),
		])

		amqpConnection = (await amqplib.connect(
			rabbitContainer.getAmqpUrl(),
		)) as unknown as amqplib.Connection
		pgClient = new PgClient({
			connectionString: pgContainer.getConnectionUri(),
		})
		await pgClient.connect()
		redis = new Redis(redisContainer.getConnectionUrl())

		await pgClient.query(
			`CREATE TABLE ${CONTEXT_TABLE} (run_id TEXT PRIMARY KEY, context_data JSONB);`,
		)
		await pgClient.query(
			`CREATE TABLE ${STATUS_TABLE} (run_id TEXT PRIMARY KEY, status_data JSONB, updated_at TIMESTAMPTZ);`,
		)
	}, 90000)

	afterAll(async () => {
		// @ts-expect-error bad amqp types
		await amqpConnection.close()
		await pgClient.end()
		await Promise.all([rabbitContainer.stop(), pgContainer.stop(), redisContainer.stop()])
	})

	it('should successfully enqueue a job into the RabbitMQ queue', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new RabbitMqAdapter({
			// @ts-expect-error bad amqp types
			amqpConnection,
			pgClient,
			queueName: QUEUE_NAME,
			contextTableName: CONTEXT_TABLE,
			statusTableName: STATUS_TABLE,
			coordinationStore,
			runtimeOptions: {},
		})

		// @ts-expect-error bad amqp types
		const channel = await amqpConnection.createChannel()
		await channel.assertQueue(QUEUE_NAME, { durable: true })
		;(adapter as any).channel = channel

		const job: JobPayload = {
			runId: 'run-rabbit-1',
			blueprintId: 'bp-rabbit',
			nodeId: 'node-rabbit',
		}

		await (adapter as any).enqueueJob(job)

		const message = await channel.get(QUEUE_NAME, { noAck: true })
		expect(message).not.toBe(false)

		const msg = message as amqplib.Message
		const receivedJob = JSON.parse(msg.content.toString())
		expect(receivedJob).toEqual(job)

		await channel.close()
	})

	it('should support delta-based persistence with patch operations', async () => {
		const runId = 'test-delta-run'
		const context = new PostgresContext(runId, {
			client: pgClient,
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
})

describe('RabbitMqAdapter - Unit Tests', () => {
	it('should throw on registerWebhookEndpoint', async () => {
		const mockAmqp = {
			createChannel: vi.fn().mockResolvedValue({}),
		}
		const mockPg = {
			query: vi.fn().mockResolvedValue({}),
		}

		const adapter = new RabbitMqAdapter({
			amqpConnection: mockAmqp as any,
			pgClient: mockPg as any,
			contextTableName: 'contexts',
			statusTableName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		await expect(adapter.registerWebhookEndpoint('run-1', 'node-1')).rejects.toThrow(
			'registerWebhookEndpoint not implemented for RabbitMQAdapter',
		)
	})

	it('should create context using createContext', () => {
		const mockAmqp = {
			createChannel: vi.fn().mockResolvedValue({}),
		}
		const mockPg = {
			query: vi.fn().mockResolvedValue({}),
		}

		const adapter = new RabbitMqAdapter({
			amqpConnection: mockAmqp as any,
			pgClient: mockPg as any,
			contextTableName: 'contexts',
			statusTableName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		const context = (adapter as any).createContext('test-run')
		expect(context).toBeDefined()
		expect(context.runId).toBe('test-run')
	})

	it('should use default queue name', () => {
		const mockAmqp = {
			createChannel: vi.fn().mockResolvedValue({}),
		}
		const mockPg = {
			query: vi.fn().mockResolvedValue({}),
		}

		const adapter = new RabbitMqAdapter({
			amqpConnection: mockAmqp as any,
			pgClient: mockPg as any,
			contextTableName: 'contexts',
			statusTableName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		expect((adapter as any).queueName).toBe('flowcraft-queue')
	})

	it('should use custom queue name', () => {
		const mockAmqp = {
			createChannel: vi.fn().mockResolvedValue({}),
		}
		const mockPg = {
			query: vi.fn().mockResolvedValue({}),
		}

		const adapter = new RabbitMqAdapter({
			amqpConnection: mockAmqp as any,
			pgClient: mockPg as any,
			contextTableName: 'contexts',
			statusTableName: 'statuses',
			queueName: 'custom-queue',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		expect((adapter as any).queueName).toBe('custom-queue')
	})

	it('should throw when enqueueJob and channel not available', async () => {
		const mockAmqp = {
			createChannel: vi.fn().mockResolvedValue({}),
		}
		const mockPg = {
			query: vi.fn().mockResolvedValue({}),
		}

		const adapter = new RabbitMqAdapter({
			amqpConnection: mockAmqp as any,
			pgClient: mockPg as any,
			contextTableName: 'contexts',
			statusTableName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		await expect(
			(adapter as any).enqueueJob({ runId: 'r1', blueprintId: 'b1', nodeId: 'n1' }),
		).rejects.toThrow('RabbitMQ channel is not available. Ensure the worker has been started.')
	})

	it('should warn when channel already set up', async () => {
		const mockAmqp = {
			createChannel: vi.fn().mockResolvedValue({}),
		}
		const mockPg = {
			query: vi.fn().mockResolvedValue({}),
		}

		const adapter = new RabbitMqAdapter({
			amqpConnection: mockAmqp as any,
			pgClient: mockPg as any,
			contextTableName: 'contexts',
			statusTableName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		;(adapter as any).channel = {}
		await (adapter as any).processJobs(() => {})
	})

	it('should stop and close channel', async () => {
		const mockChannel = {
			close: vi.fn().mockResolvedValue({}),
		}
		const mockAmqp = {
			createChannel: vi.fn().mockResolvedValue({}),
		}
		const mockPg = {
			query: vi.fn().mockResolvedValue({}),
		}

		const adapter = new RabbitMqAdapter({
			amqpConnection: mockAmqp as any,
			pgClient: mockPg as any,
			contextTableName: 'contexts',
			statusTableName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		;(adapter as any).channel = mockChannel
		await adapter.stop()
		expect(mockChannel.close).toHaveBeenCalled()
	})
})

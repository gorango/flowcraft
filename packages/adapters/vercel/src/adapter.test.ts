import type { StartedRedisContainer } from '@testcontainers/redis'
import { RedisContainer } from '@testcontainers/redis'
import type { ICoordinationStore, JobPayload, PatchOperation } from 'flowcraft'
import Redis from 'ioredis'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { VercelQueueAdapter } from './adapter'
import { VercelKvContext } from './context'
import { VercelKvCoordinationStore } from './store'

const TOPIC_NAME = 'flowcraft-jobs-topic'
const CONTEXT_PREFIX = 'test:context:'
const STATUS_PREFIX = 'test:status:'

describe('VercelQueueAdapter - Testcontainers Integration', () => {
	let redisContainer: StartedRedisContainer
	let redis: Redis

	beforeAll(async () => {
		redisContainer = await new RedisContainer('redis:8.2.2').start()
		redis = new Redis(redisContainer.getConnectionUrl())
	}, 60000)

	afterAll(async () => {
		await redisContainer?.stop()
	})

	it('should expose handleJob() as a public method for serverless usage', async () => {
		const coordinationStore = new VercelKvCoordinationStore({ client: redis })
		const adapter = new VercelQueueAdapter({
			redisClient: redis,
			topicName: TOPIC_NAME,
			contextKeyPrefix: CONTEXT_PREFIX,
			statusKeyPrefix: STATUS_PREFIX,
			coordinationStore,
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

		expect(typeof adapter.handleJob).toBe('function')

		const job: JobPayload = {
			runId: 'serverless-test-run',
			blueprintId: 'test',
			nodeId: 'A',
		}

		await expect(adapter.handleJob(job)).resolves.not.toThrow()
	})

	it('should throw when start() is called (serverless only)', async () => {
		const coordinationStore = new VercelKvCoordinationStore({ client: redis })
		const adapter = new VercelQueueAdapter({
			redisClient: redis,
			topicName: TOPIC_NAME,
			coordinationStore,
			runtimeOptions: {},
		})

		expect(() => adapter.start()).toThrow('start() is not supported in serverless mode')
	})

	it('should throw when processJobs() is called (serverless only)', async () => {
		const coordinationStore = new VercelKvCoordinationStore({ client: redis })
		const adapter = new VercelQueueAdapter({
			redisClient: redis,
			topicName: TOPIC_NAME,
			coordinationStore,
			runtimeOptions: {},
		})

		expect(() => (adapter as any).processJobs(() => {})).toThrow(
			'processJobs() is not supported in serverless mode',
		)
	})

	it('should support delta-based persistence with patch operations', async () => {
		const runId = 'test-delta-run'
		const context = new VercelKvContext(runId, {
			client: redis,
			keyPrefix: CONTEXT_PREFIX,
		})

		await context.set('user', { id: 1, name: 'Alice' })
		await context.set('count', 5)
		await context.set('items', ['a', 'b', 'c'])

		expect(await context.get('user')).toEqual({ id: 1, name: 'Alice' })
		expect(await context.get('count')).toBe(5)
		expect(await context.get('items')).toEqual(['a', 'b', 'c'])

		const operations: PatchOperation[] = [
			{ op: 'set', key: 'user', value: { id: 1, name: 'Alice Updated' } },
			{ op: 'set', key: 'count', value: 10 },
			{ op: 'delete', key: 'items' },
			{ op: 'set', key: 'status', value: 'completed' },
		]

		await context.patch(operations)

		expect(await context.get('user')).toEqual({ id: 1, name: 'Alice Updated' })
		expect(await context.get('count')).toBe(10)
		expect(await context.get('items')).toBeUndefined()
		expect(await context.get('status')).toBe('completed')

		const fullState = await context.toJSON()
		expect(fullState).toEqual({
			user: { id: 1, name: 'Alice Updated' },
			count: 10,
			status: 'completed',
		})
	})

	it('should support coordination store operations', async () => {
		const store = new VercelKvCoordinationStore({ client: redis, keyPrefix: 'test:coord:' })

		const setResult = await store.setIfNotExist('lock-key', 'locked', 60)
		expect(setResult).toBe(true)

		const secondSet = await store.setIfNotExist('lock-key', 'locked', 60)
		expect(secondSet).toBe(false)

		const incrementResult = await store.increment('counter', 60)
		expect(incrementResult).toBe(1)

		const incrementResult2 = await store.increment('counter', 60)
		expect(incrementResult2).toBe(2)

		const value = await store.get('lock-key')
		expect(value).toBe('locked')

		await store.delete('lock-key')
		const deletedValue = await store.get('lock-key')
		expect(deletedValue).toBeUndefined()
	})

	it('should publish final status to Redis', async () => {
		const coordinationStore: ICoordinationStore = {
			increment: () => Promise.resolve(1),
			setIfNotExist: () => Promise.resolve(true),
			extendTTL: () => Promise.resolve(true),
			delete: () => Promise.resolve(),
			get: () => Promise.resolve(undefined),
		}
		const adapter = new VercelQueueAdapter({
			redisClient: redis,
			topicName: TOPIC_NAME,
			contextKeyPrefix: CONTEXT_PREFIX,
			statusKeyPrefix: STATUS_PREFIX,
			coordinationStore,
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

		const job: JobPayload = {
			runId: 'status-test-run',
			blueprintId: 'test',
			nodeId: 'A',
		}

		await adapter.handleJob(job)

		const statusKey = `${STATUS_PREFIX}status-test-run`
		const statusJson = await redis.get(statusKey)
		expect(statusJson).not.toBeNull()
		const status = JSON.parse(statusJson!)
		expect(status.status).toBe('running')
		expect(status.lastUpdated).toBeDefined()
	})
})

describe('VercelQueueAdapter - Unit Tests', () => {
	it('should throw on registerWebhookEndpoint', async () => {
		const mockRedis = {
			get: vi.fn(),
			set: vi.fn(),
		}
		const adapter = new VercelQueueAdapter({
			redisClient: mockRedis as any,
			topicName: 'test-topic',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		await expect(adapter.registerWebhookEndpoint('run-1', 'node-1')).rejects.toThrow(
			'registerWebhookEndpoint not implemented for VercelQueueAdapter',
		)
	})

	it('should throw when calling processJobs', () => {
		const mockRedis = { get: vi.fn(), set: vi.fn() }
		const adapter = new VercelQueueAdapter({
			redisClient: mockRedis as any,
			topicName: 'test-topic',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		expect(() => (adapter as any).processJobs(() => {})).toThrow(
			'processJobs() is not supported in serverless mode',
		)
	})

	it('should warn when stop() is called', () => {
		const mockRedis = { get: vi.fn(), set: vi.fn() }
		const adapter = new VercelQueueAdapter({
			redisClient: mockRedis as any,
			topicName: 'test-topic',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		adapter.stop()
	})
})

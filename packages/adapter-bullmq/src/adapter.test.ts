import type { StartedRedisContainer } from '@testcontainers/redis'
import { RedisContainer } from '@testcontainers/redis'
import type { JobPayload, NodeDefinition, PatchOperation } from 'flowcraft'
import Redis from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BullMQAdapter } from './adapter'
import { RedisContext } from './context'
import { RedisCoordinationStore } from './store'

const QUEUE_NAME = 'test-bullmq-queue'

describe('BullMQAdapter - Testcontainers Integration', () => {
	let redisContainer: StartedRedisContainer
	let redis: Redis

	beforeAll(async () => {
		redisContainer = await new RedisContainer('redis:8.2.2').start()
		redis = new Redis(redisContainer.getConnectionUrl())
	}, 30000)

	afterAll(async () => {
		await redis.quit()
		await redisContainer.stop()
	})

	it('should successfully enqueue a job into the BullMQ Redis structures', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new BullMQAdapter({
			connection: redis,
			queueName: QUEUE_NAME,
			coordinationStore,
			runtimeOptions: {},
		})

		const job: JobPayload = {
			runId: 'run-bull-1',
			blueprintId: 'bp-bull',
			nodeId: 'node-bull',
		}

		await (adapter as any).enqueueJob(job)
		const waitingJobs = await (adapter as any).queue.getWaiting()
		expect(waitingJobs.length).toBe(1)
		expect(waitingJobs[0].data).toEqual(job)
		expect(waitingJobs[0].opts.jobId).toBe('run-bull-1_node-bull')
	})

	it('should support delta-based persistence with patch operations', async () => {
		const runId = 'test-delta-run'
		const context = new RedisContext(redis, runId)

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

describe('BullMQAdapter - State Key TTL', () => {
	let redisContainer: StartedRedisContainer
	let redis: Redis

	beforeAll(async () => {
		redisContainer = await new RedisContainer('redis:8.2.2').start()
		redis = new Redis(redisContainer.getConnectionUrl())
	}, 30000)

	afterAll(async () => {
		await redis.quit()
		await redisContainer.stop()
	})

	it('should apply stateTtlSeconds TTL to both state and status keys after a run finishes', async () => {
		const runId = 'ttl-run'
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new BullMQAdapter({
			connection: redis,
			queueName: 'ttl-test-queue',
			coordinationStore,
			runtimeOptions: {},
			stateTtlSeconds: 300,
		})

		await redis.hset(`workflow:state:${runId}`, 'someKey', 'someValue')
		await (adapter as any).publishFinalResult(runId, { status: 'completed' })

		const statusTtl = await redis.ttl(`workflow:status:${runId}`)
		const stateTtl = await redis.ttl(`workflow:state:${runId}`)

		expect(statusTtl).toBeGreaterThan(300 - 5)
		expect(statusTtl).toBeLessThanOrEqual(300)
		expect(stateTtl).toBeGreaterThan(300 - 5)
		expect(stateTtl).toBeLessThanOrEqual(300)

		await adapter.close()
	})

	it('should not set a TTL when stateTtlSeconds is 0 (persist indefinitely)', async () => {
		const runId = 'ttl-disabled-run'
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new BullMQAdapter({
			connection: redis,
			queueName: 'ttl-test-queue-2',
			coordinationStore,
			runtimeOptions: {},
			stateTtlSeconds: 0,
		})

		await redis.hset(`workflow:state:${runId}`, 'someKey', 'someValue')
		await (adapter as any).publishFinalResult(runId, { status: 'completed' })

		// TTL of -1 means the key exists with no expiry
		expect(await redis.ttl(`workflow:status:${runId}`)).toBe(-1)
		expect(await redis.ttl(`workflow:state:${runId}`)).toBe(-1)

		await adapter.close()
	})
})

describe('BullMQAdapter - Retry Mode', () => {
	let redisContainer: StartedRedisContainer
	let redis: Redis

	beforeAll(async () => {
		redisContainer = await new RedisContainer('redis:8.2.2').start()
		redis = new Redis(redisContainer.getConnectionUrl())
	}, 30000)

	afterAll(async () => {
		await redis.quit()
		await redisContainer.stop()
	})

	it('should default to in-process retry mode', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new BullMQAdapter({
			connection: redis,
			queueName: 'retry-mode-test-1',
			coordinationStore,
			runtimeOptions: {},
		})

		expect((adapter as any).retryMode).toBe('in-process')

		const nodeDef: NodeDefinition = { id: 'A', uses: 'test', config: { maxRetries: 3 } }
		const shouldRetry = (adapter as any).shouldRetryInProcess(nodeDef)
		expect(shouldRetry).toBe(true)
		const retryOpts = (adapter as any).getQueueRetryOptions(nodeDef)
		expect(retryOpts).toBeUndefined()

		await adapter.close()
	})

	it('should delegate retries to queue when retryMode is queue', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new BullMQAdapter({
			connection: redis,
			queueName: 'retry-mode-test-2',
			coordinationStore,
			runtimeOptions: {},
			retryMode: 'queue',
		})

		expect((adapter as any).retryMode).toBe('queue')

		const nodeDef: NodeDefinition = {
			id: 'A',
			uses: 'test',
			config: { maxRetries: 3, retryDelay: 2000 },
		}
		const shouldRetry = (adapter as any).shouldRetryInProcess(nodeDef)
		expect(shouldRetry).toBe(false)

		const retryOptions = (adapter as any).getQueueRetryOptions(nodeDef)
		expect(retryOptions).toEqual({
			attempts: 3,
			backoff: { type: 'exponential', delay: 2000 },
		})

		await adapter.close()
	})

	it('should include queue retry options in enqueued jobs when retryMode is queue', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new BullMQAdapter({
			connection: redis,
			queueName: 'retry-mode-test-3',
			coordinationStore,
			runtimeOptions: {
				blueprints: {
					'test-bp': {
						id: 'test-bp',
						nodes: [
							{ id: 'A', uses: 'test', config: { maxRetries: 4, retryDelay: 500 } },
							{ id: 'B', uses: 'output' },
						],
						edges: [{ source: 'A', target: 'B' }],
					},
				},
			},
			retryMode: 'queue',
		})

		const job: JobPayload = {
			runId: 'run-retry-1',
			blueprintId: 'test-bp',
			nodeId: 'A',
		}

		await (adapter as any).enqueueJob(job)
		const waitingJobs = await (adapter as any).queue.getWaiting()
		expect(waitingJobs.length).toBe(1)
		expect(waitingJobs[0].data).toEqual(job)
		expect(waitingJobs[0].opts.attempts).toBe(4)
		expect(waitingJobs[0].opts.backoff).toEqual({ type: 'exponential', delay: 500 })

		await adapter.close()
	})

	it('should not include queue retry options when retryMode is in-process', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new BullMQAdapter({
			connection: redis,
			queueName: 'retry-mode-test-4',
			coordinationStore,
			runtimeOptions: {
				blueprints: {
					'test-bp-2': {
						id: 'test-bp-2',
						nodes: [{ id: 'A', uses: 'test', config: { maxRetries: 4, retryDelay: 500 } }],
						edges: [],
					},
				},
			},
			retryMode: 'in-process',
		})

		const job: JobPayload = {
			runId: 'run-retry-2',
			blueprintId: 'test-bp-2',
			nodeId: 'A',
		}

		await (adapter as any).enqueueJob(job)
		const waitingJobs = await (adapter as any).queue.getWaiting()
		expect(waitingJobs.length).toBe(1)
		expect(waitingJobs[0].opts.attempts).toBe(0)
		expect(waitingJobs[0].opts.backoff).toBeUndefined()

		await adapter.close()
	})

	it('should use defaults when node config has no retry settings in queue mode', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new BullMQAdapter({
			connection: redis,
			queueName: 'retry-mode-test-5',
			coordinationStore,
			runtimeOptions: {
				blueprints: {
					'test-bp-3': {
						id: 'test-bp-3',
						nodes: [{ id: 'A', uses: 'test' }],
						edges: [],
					},
				},
			},
			retryMode: 'queue',
		})

		const job: JobPayload = {
			runId: 'run-retry-3',
			blueprintId: 'test-bp-3',
			nodeId: 'A',
		}

		await (adapter as any).enqueueJob(job)
		const waitingJobs = await (adapter as any).queue.getWaiting()
		expect(waitingJobs.length).toBe(1)
		expect(waitingJobs[0].opts.attempts).toBe(1)
		expect(waitingJobs[0].opts.backoff).toEqual({ type: 'exponential', delay: 1000 })

		await adapter.close()
	})

	it('should use jobId for idempotency', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new BullMQAdapter({
			connection: redis,
			queueName: 'retry-mode-test-6',
			coordinationStore,
			runtimeOptions: {
				blueprints: {
					'test-bp-4': {
						id: 'test-bp-4',
						nodes: [{ id: 'A', uses: 'test', config: { maxRetries: 2 } }],
						edges: [],
					},
				},
			},
			retryMode: 'queue',
		})

		const job: JobPayload = {
			runId: 'run-idempotent',
			blueprintId: 'test-bp-4',
			nodeId: 'A',
		}

		await (adapter as any).enqueueJob(job)
		const waitingJobs = await (adapter as any).queue.getWaiting()
		expect(waitingJobs.length).toBe(1)
		expect(waitingJobs[0].opts.jobId).toBe('run-idempotent_A')

		await adapter.close()
	})
})

describe('BullMQAdapter - Default Job Options', () => {
	let redisContainer: StartedRedisContainer
	let redis: Redis

	beforeAll(async () => {
		redisContainer = await new RedisContainer('redis:8.2.2').start()
		redis = new Redis(redisContainer.getConnectionUrl())
	}, 30000)

	afterAll(async () => {
		await redis.quit()
		await redisContainer.stop()
	})

	it('should support defaultJobOptions for configuring job retention policies', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new BullMQAdapter({
			connection: redis,
			queueName: 'default-job-opts-test',
			coordinationStore,
			runtimeOptions: {},
			defaultJobOptions: {
				removeOnComplete: true,
				removeOnFail: 1000,
			},
		})

		const job: JobPayload = {
			runId: 'run-job-opts',
			blueprintId: 'test-bp-opts',
			nodeId: 'A',
		}

		await (adapter as any).enqueueJob(job)
		const waitingJobs = await (adapter as any).queue.getWaiting()

		expect(waitingJobs.length).toBe(1)
		expect(waitingJobs[0].opts.removeOnComplete).toBe(true)
		expect(waitingJobs[0].opts.removeOnFail).toBe(1000)

		await adapter.close()
	})
})

describe('BullMQAdapter - Context Methods', () => {
	let redisContainer: StartedRedisContainer
	let redis: Redis

	beforeAll(async () => {
		redisContainer = await new RedisContainer('redis:8.2.2').start()
		redis = new Redis(redisContainer.getConnectionUrl())
	}, 30000)

	afterAll(async () => {
		await redis.quit()
		await redisContainer.stop()
	})

	it('should support has() to check key existence', async () => {
		const runId = 'has-delete-run'
		const context = new RedisContext(redis, runId)

		expect(await context.has('missingKey')).toBe(false)
		await context.set('existingKey', { value: 123 })
		expect(await context.has('existingKey')).toBe(true)
	})

	it('should support delete() to remove keys', async () => {
		const runId = 'delete-run'
		const context = new RedisContext(redis, runId)

		await context.set('toDelete', 'will be gone')
		expect(await context.has('toDelete')).toBe(true)
		expect(await context.delete('toDelete')).toBe(true)
		expect(await context.has('toDelete')).toBe(false)
		expect(await context.delete('alreadyDeleted')).toBe(false)
	})
})

describe('BullMQAdapter - Coordination Store', () => {
	let redisContainer: StartedRedisContainer
	let redis: Redis

	beforeAll(async () => {
		redisContainer = await new RedisContainer('redis:8.2.2').start()
		redis = new Redis(redisContainer.getConnectionUrl())
	}, 30000)

	afterAll(async () => {
		await redis.quit()
		await redisContainer.stop()
	})

	it('should increment counters with TTL', async () => {
		const store = new RedisCoordinationStore(redis)
		const key = 'test-counter'

		const count1 = await store.increment(key, 60)
		expect(count1).toBe(1)
		const count2 = await store.increment(key, 60)
		expect(count2).toBe(2)
	})

	it('should set values with NX (setIfNotExist)', async () => {
		const store = new RedisCoordinationStore(redis)
		const key = 'test-nx'

		const set1 = await store.setIfNotExist(key, 'first', 60)
		expect(set1).toBe(true)
		const set2 = await store.setIfNotExist(key, 'second', 60)
		expect(set2).toBe(false)
	})

	it('should extend TTL on keys', async () => {
		const store = new RedisCoordinationStore(redis)
		const key = 'test-ttl'

		await redis.set(key, 'value')
		const extended = await store.extendTTL(key, 120)
		expect(extended).toBe(true)
	})

	it('should get and delete values', async () => {
		const store = new RedisCoordinationStore(redis)
		const key = 'test-get'

		await store.setIfNotExist(key, 'value', 60)
		const value = await store.get(key)
		expect(value).toBe('value')
		await store.delete(key)
		const afterDelete = await store.get(key)
		expect(afterDelete).toBeUndefined()
	})
})

describe('BullMQAdapter - Patch Edge Cases', () => {
	let redisContainer: StartedRedisContainer
	let redis: Redis

	beforeAll(async () => {
		redisContainer = await new RedisContainer('redis:8.2.2').start()
		redis = new Redis(redisContainer.getConnectionUrl())
	}, 30000)

	afterAll(async () => {
		await redis.quit()
		await redisContainer.stop()
	})

	it('should handle empty patch operations', async () => {
		const runId = 'empty-patch-run'
		const context = new RedisContext(redis, runId)

		await context.set('existing', 'value')
		await context.patch([])
		expect(await context.get('existing')).toBe('value')
	})
})

describe('BullMQAdapter - Context and Options', () => {
	let redisContainer: StartedRedisContainer
	let redis: Redis

	beforeAll(async () => {
		redisContainer = await new RedisContainer('redis:8.2.2').start()
		redis = new Redis(redisContainer.getConnectionUrl())
	}, 30000)

	afterAll(async () => {
		await redis.quit()
		await redisContainer.stop()
	})

	it('should create context using createContext method', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new BullMQAdapter({
			connection: redis,
			queueName: 'context-test',
			coordinationStore,
			runtimeOptions: {},
		})

		const context = (adapter as any).createContext('test-run')
		expect(context).toBeDefined()
		expect(context.type).toBe('async')

		await context.set('key', 'value')
		expect(await context.get('key')).toBe('value')

		await adapter.close()
	})

	it('should use default queue name when not provided', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new BullMQAdapter({
			connection: redis,
			coordinationStore,
			runtimeOptions: {},
		})

		expect((adapter as any).queueName).toBe('flowcraft-queue')
		await adapter.close()
	})

	it('should use custom queue name', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new BullMQAdapter({
			connection: redis,
			queueName: 'my-custom-queue',
			coordinationStore,
			runtimeOptions: {},
		})

		expect((adapter as any).queueName).toBe('my-custom-queue')
		await adapter.close()
	})

	it('should default stateTtlSeconds to 24 hours', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new BullMQAdapter({
			connection: redis,
			queueName: 'ttl-default-test',
			coordinationStore,
			runtimeOptions: {},
		})

		expect((adapter as any).stateTtlSeconds).toBe(86400)
		await adapter.close()
	})
})

describe('BullMQAdapter - Unimplemented Methods', () => {
	let redisContainer: StartedRedisContainer
	let redis: Redis

	beforeAll(async () => {
		redisContainer = await new RedisContainer('redis:8.2.2').start()
		redis = new Redis(redisContainer.getConnectionUrl())
	}, 30000)

	afterAll(async () => {
		await redis.quit()
		await redisContainer.stop()
	})

	it('should throw when calling unimplemented registerWebhookEndpoint', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new BullMQAdapter({
			connection: redis,
			queueName: 'webhook-test',
			coordinationStore,
			runtimeOptions: {},
		})

		await expect(adapter.registerWebhookEndpoint('run-1', 'node-1')).rejects.toThrow(
			'registerWebhookEndpoint not implemented for BullMQAdapter',
		)

		await adapter.close()
	})
})

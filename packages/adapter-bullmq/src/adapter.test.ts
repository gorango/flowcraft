import type { StartedRedisContainer } from '@testcontainers/redis'
import { RedisContainer } from '@testcontainers/redis'
import type { JobPayload } from 'flowcraft'
import Redis from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BullMQAdapter } from './adapter'
import { RedisCoordinationStore } from './store'

const QUEUE_NAME = 'test-bullmq-queue'

describe('BullMQAdapter - Testcontainers Integration', () => {
	let redisContainer: StartedRedisContainer
	let redis: Redis

	beforeAll(async () => {
		redisContainer = await new RedisContainer('redis:latest').start()
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
	})
})

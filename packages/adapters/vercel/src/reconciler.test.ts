import { describe, expect, it, vi } from 'vitest'
import { createVercelReconciler } from './reconciler'

function createMockRedis(items: Record<string, any> = {}) {
	return {
		keys: vi.fn().mockResolvedValue(Object.keys(items)),
		get: vi.fn().mockImplementation(async (key: string) => {
			return items[key] ? JSON.stringify(items[key]) : null
		}),
	}
}

function createMockAdapter() {
	return {
		reconcile: vi.fn().mockResolvedValue(new Set(['node-1'])),
		logger: {
			info: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		},
	}
}

describe('createVercelReconciler', function () {
	it('should create reconciler', function () {
		const redis = createMockRedis({})
		const adapter = createMockAdapter()
		const reconciler = createVercelReconciler({
			adapter: adapter as any,
			redisClient: redis as any,
			stalledThresholdSeconds: 300,
		})
		expect(reconciler.run).toBeDefined()
	})

	it('should return empty stats when no stalled runs', async function () {
		const redis = createMockRedis({})
		const adapter = createMockAdapter()
		const reconciler = createVercelReconciler({
			adapter: adapter as any,
			redisClient: redis as any,
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(0)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(0)
	})

	it('should detect and reconcile stalled runs', async function () {
		const oldTimestamp = Math.floor(Date.now() / 1000) - 400
		const redis = createMockRedis({
			'flowcraft:status:run-1': { status: 'running', lastUpdated: oldTimestamp },
			'flowcraft:status:run-2': { status: 'running', lastUpdated: oldTimestamp },
		})
		const adapter = createMockAdapter()
		const reconciler = createVercelReconciler({
			adapter: adapter as any,
			redisClient: redis as any,
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(2)
		expect(stats.reconciledRuns).toBe(2)
		expect(stats.failedRuns).toBe(0)
	})

	it('should skip runs that are still running', async function () {
		const recentTimestamp = Math.floor(Date.now() / 1000) - 60
		const redis = createMockRedis({
			'flowcraft:status:run-1': { status: 'running', lastUpdated: recentTimestamp },
		})
		const adapter = createMockAdapter()
		const reconciler = createVercelReconciler({
			adapter: adapter as any,
			redisClient: redis as any,
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(0)
	})

	it('should handle reconciliation failure', async function () {
		const oldTimestamp = Math.floor(Date.now() / 1000) - 400
		const redis = createMockRedis({
			'flowcraft:status:run-1': { status: 'running', lastUpdated: oldTimestamp },
		})
		const adapter = {
			reconcile: vi.fn().mockRejectedValue(new Error('Reconciliation failed')),
			logger: {
				info: vi.fn(),
				error: vi.fn(),
				warn: vi.fn(),
				debug: vi.fn(),
			},
		}
		const reconciler = createVercelReconciler({
			adapter: adapter as any,
			redisClient: redis as any,
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(1)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(1)
	})

	it('should use custom status prefix', async function () {
		const oldTimestamp = Math.floor(Date.now() / 1000) - 400
		const redis = createMockRedis({
			'custom:run-1': { status: 'running', lastUpdated: oldTimestamp },
		})
		const adapter = createMockAdapter()
		const reconciler = createVercelReconciler({
			adapter: adapter as any,
			redisClient: redis as any,
			stalledThresholdSeconds: 300,
			statusKeyPrefix: 'custom:',
		})

		await reconciler.run()
		expect(redis.keys).toHaveBeenCalledWith('custom:*')
	})

	it('should use custom logger', function () {
		const redis = createMockRedis({})
		const adapter = createMockAdapter()
		const customLogger = {
			info: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		}
		createVercelReconciler({
			adapter: adapter as any,
			redisClient: redis as any,
			stalledThresholdSeconds: 300,
			logger: customLogger,
		})
	})
})

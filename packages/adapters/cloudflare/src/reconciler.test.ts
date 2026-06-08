import { describe, expect, it, vi } from 'vitest'
import { createCloudflareReconciler } from './reconciler'

function createMockStatusKV(items: Record<string, any> = {}) {
	return {
		get: vi.fn().mockImplementation(async (key) => {
			if (key in items) {
				return JSON.stringify(items[key])
			}
			return null
		}),
		list: vi.fn().mockImplementation(async () => ({
			keys: Object.keys(items).map((name) => ({ name })),
		})),
	}
}

function createMockAdapter() {
	return {
		reconcile: vi.fn().mockResolvedValue(new Set(['node-1'])),
	}
}

function createMockLogger() {
	return {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	}
}

describe('createCloudflareReconciler', function () {
	it('should create reconciler', function () {
		const kv = createMockStatusKV({})
		const adapter = createMockAdapter()
		const reconciler = createCloudflareReconciler({
			adapter: adapter as any,
			statusKVNamespace: kv as any,
			stalledThresholdSeconds: 300,
		})
		expect(reconciler.run).toBeDefined()
	})

	it('should return empty stats when no stalled runs', async function () {
		const kv = createMockStatusKV({})
		const adapter = createMockAdapter()
		const reconciler = createCloudflareReconciler({
			adapter: adapter as any,
			statusKVNamespace: kv as any,
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(0)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(0)
	})

	it('should detect and reconcile stalled runs', async function () {
		const oldTimestamp = Math.floor(Date.now() / 1000) - 400
		const kv = createMockStatusKV({
			'flowcraft:status:run-1': { status: 'running', lastUpdated: oldTimestamp },
			'flowcraft:status:run-2': { status: 'running', lastUpdated: oldTimestamp },
		})
		const adapter = createMockAdapter()
		const reconciler = createCloudflareReconciler({
			adapter: adapter as any,
			statusKVNamespace: kv as any,
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(2)
		expect(stats.reconciledRuns).toBe(2)
		expect(stats.failedRuns).toBe(0)
	})

	it('should skip runs that are still running', async function () {
		const recentTimestamp = Math.floor(Date.now() / 1000) - 60
		const kv = createMockStatusKV({
			'flowcraft:status:run-1': { status: 'running', lastUpdated: recentTimestamp },
		})
		const adapter = createMockAdapter()
		const reconciler = createCloudflareReconciler({
			adapter: adapter as any,
			statusKVNamespace: kv as any,
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(0)
	})

	it('should skip completed runs', async function () {
		const oldTimestamp = Math.floor(Date.now() / 1000) - 400
		const kv = createMockStatusKV({
			'flowcraft:status:run-1': { status: 'completed', lastUpdated: oldTimestamp },
		})
		const adapter = createMockAdapter()
		const reconciler = createCloudflareReconciler({
			adapter: adapter as any,
			statusKVNamespace: kv as any,
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(0)
	})

	it('should handle reconciliation failure', async function () {
		const oldTimestamp = Math.floor(Date.now() / 1000) - 400
		const kv = createMockStatusKV({
			'flowcraft:status:run-1': { status: 'running', lastUpdated: oldTimestamp },
		})
		const adapter = {
			reconcile: vi.fn().mockRejectedValue(new Error('Reconciliation failed')),
		}
		const reconciler = createCloudflareReconciler({
			adapter: adapter as any,
			statusKVNamespace: kv as any,
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(1)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(1)
	})

	it('should handle empty status JSON', async function () {
		const kv = createMockStatusKV({
			'flowcraft:status:run-1': null,
		})
		const adapter = createMockAdapter()
		const reconciler = createCloudflareReconciler({
			adapter: adapter as any,
			statusKVNamespace: kv as any,
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(0)
	})

	it('should use custom status prefix', async function () {
		const oldTimestamp = Math.floor(Date.now() / 1000) - 400
		const kv = createMockStatusKV({
			'custom:run-1': { status: 'running', lastUpdated: oldTimestamp },
		})
		const adapter = createMockAdapter()
		const logger = createMockLogger()
		const reconciler = createCloudflareReconciler({
			adapter: adapter as any,
			statusKVNamespace: kv as any,
			stalledThresholdSeconds: 300,
			statusPrefix: 'custom:',
			logger,
		})

		await reconciler.run()
		expect(kv.list).toHaveBeenCalledWith({ prefix: 'custom:' })
	})
})

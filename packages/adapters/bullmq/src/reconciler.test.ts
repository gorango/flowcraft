import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBullMQReconciler } from './reconciler'

function createMockAdapter() {
	return {
		reconcile: vi.fn().mockResolvedValue(new Set(['node-1', 'node-2'])),
		logger: {
			info: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		},
	}
}

describe('createBullMQReconciler - Unit Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('should create reconciler', async () => {
		const mockRedis = {
			scan: vi.fn().mockResolvedValue([0, []]),
			object: vi.fn(),
		} as any

		const adapter = createMockAdapter()
		const reconciler = createBullMQReconciler({
			adapter: adapter as any,
			redis: mockRedis,
			stalledThresholdSeconds: 300,
			logger: adapter.logger,
		})

		expect(reconciler.run).toBeDefined()
	})

	it('should return empty stats when no keys scanned', async () => {
		const mockRedis = {
			scan: vi.fn().mockResolvedValue([0, []]),
			object: vi.fn(),
		} as any

		const adapter = createMockAdapter()
		const reconciler = createBullMQReconciler({
			adapter: adapter as any,
			redis: mockRedis,
			stalledThresholdSeconds: 300,
			logger: adapter.logger,
		})

		const stats = await reconciler.run()

		expect(stats.scannedKeys).toBe(0)
		expect(stats.stalledRuns).toBe(0)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(0)
	})

	it('should detect stalled runs and reconcile them', async () => {
		const mockRedis = {
			scan: vi.fn().mockResolvedValue([0, ['workflow:state:run-1', 'workflow:state:run-2']]),
			object: vi.fn().mockImplementation((cmd: string, key: string) => {
				if (key === 'workflow:state:run-1' || key === 'workflow:state:run-2') {
					return 600
				}
				return null
			}),
		} as any

		const adapter = createMockAdapter()
		const reconciler = createBullMQReconciler({
			adapter: adapter as any,
			redis: mockRedis,
			stalledThresholdSeconds: 300,
			logger: adapter.logger,
		})

		const stats = await reconciler.run()

		expect(stats.scannedKeys).toBe(2)
		expect(stats.stalledRuns).toBe(2)
		expect(stats.reconciledRuns).toBe(2)
		expect(stats.failedRuns).toBe(0)
	})

	it('should handle reconciliation failure', async () => {
		const mockRedis = {
			scan: vi.fn().mockResolvedValue([0, ['workflow:state:run-1']]),
			object: vi.fn().mockReturnValue(600),
		} as any

		const adapter = {
			reconcile: vi.fn().mockRejectedValue(new Error('Reconciliation failed')),
			logger: {
				info: vi.fn(),
				error: vi.fn(),
				warn: vi.fn(),
				debug: vi.fn(),
			},
		}
		const reconciler = createBullMQReconciler({
			adapter: adapter as any,
			redis: mockRedis,
			stalledThresholdSeconds: 300,
			logger: adapter.logger,
		})

		const stats = await reconciler.run()

		expect(stats.scannedKeys).toBe(1)
		expect(stats.stalledRuns).toBe(1)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(1)
	})

	it('should skip runs that are not stalled', async () => {
		const mockRedis = {
			scan: vi.fn().mockResolvedValue([0, ['workflow:state:run-1']]),
			object: vi.fn().mockReturnValue(60),
		} as any

		const adapter = createMockAdapter()
		const reconciler = createBullMQReconciler({
			adapter: adapter as any,
			redis: mockRedis,
			stalledThresholdSeconds: 300,
			logger: adapter.logger,
		})

		const stats = await reconciler.run()

		expect(stats.scannedKeys).toBe(1)
		expect(stats.stalledRuns).toBe(0)
		expect(stats.reconciledRuns).toBe(0)
	})

	it('should handle runs with null idle time', async () => {
		const mockRedis = {
			scan: vi.fn().mockResolvedValue([0, ['workflow:state:run-1']]),
			object: vi.fn().mockReturnValue(null),
		} as any

		const adapter = createMockAdapter()
		const reconciler = createBullMQReconciler({
			adapter: adapter as any,
			redis: mockRedis,
			stalledThresholdSeconds: 300,
			logger: adapter.logger,
		})

		const stats = await reconciler.run()

		expect(stats.stalledRuns).toBe(0)
	})

	it('should handle runs with undefined idle time', async () => {
		const mockRedis = {
			scan: vi.fn().mockResolvedValue([0, ['workflow:state:run-1']]),
			object: vi.fn().mockReturnValue(undefined),
		} as any

		const adapter = createMockAdapter()
		const reconciler = createBullMQReconciler({
			adapter: adapter as any,
			redis: mockRedis,
			stalledThresholdSeconds: 300,
			logger: adapter.logger,
		})

		const stats = await reconciler.run()

		expect(stats.stalledRuns).toBe(0)
	})

	it('should paginate through keys using SCAN cursor', async () => {
		let callCount = 0
		const mockRedis = {
			scan: vi.fn().mockImplementation(() => {
				callCount++
				if (callCount === 1) {
					return Promise.resolve([100, ['workflow:state:run-1']])
				}
				return Promise.resolve([0, ['workflow:state:run-2']])
			}),
			object: vi.fn().mockImplementation((cmd: string, key: string) => {
				if (key.startsWith('workflow:state:')) {
					return 600
				}
				return null
			}),
		} as any

		const adapter = createMockAdapter()
		const reconciler = createBullMQReconciler({
			adapter: adapter as any,
			redis: mockRedis,
			stalledThresholdSeconds: 300,
			scanCount: 1,
		})

		const stats = await reconciler.run()

		expect(stats.scannedKeys).toBe(2)
		expect(stats.stalledRuns).toBe(2)
		expect(mockRedis.scan).toHaveBeenCalledTimes(2)
	})

	it('should use custom key prefix', async () => {
		const mockRedis = {
			scan: vi.fn().mockResolvedValue([0, ['custom:state:run-1']]),
			object: vi.fn().mockReturnValue(600),
		} as any

		const adapter = createMockAdapter()
		const reconciler = createBullMQReconciler({
			adapter: adapter as any,
			redis: mockRedis,
			stalledThresholdSeconds: 300,
			keyPrefix: 'custom:state:',
			logger: adapter.logger,
		})

		await reconciler.run()

		expect(mockRedis.scan).toHaveBeenCalledWith(0, 'MATCH', 'custom:state:*', 'COUNT', 100)
	})
})

import { describe, expect, it, vi } from 'vitest'
import { createRabbitMqReconciler } from './reconciler'

function createMockPg(rows: any[] = []) {
	return {
		query: vi.fn().mockResolvedValue({ rows }),
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

describe('createRabbitMqReconciler', function () {
	it('should create reconciler', function () {
		const pg = createMockPg()
		const adapter = createMockAdapter()
		const reconciler = createRabbitMqReconciler({
			adapter: adapter as any,
			pgClient: pg as any,
			statusTableName: 'status',
			stalledThresholdSeconds: 300,
		})
		expect(reconciler.run).toBeDefined()
	})

	it('should return empty stats when no stalled runs', async function () {
		const pg = createMockPg([])
		const adapter = createMockAdapter()
		const reconciler = createRabbitMqReconciler({
			adapter: adapter as any,
			pgClient: pg as any,
			statusTableName: 'status',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(0)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(0)
	})

	it('should detect and reconcile stalled runs', async function () {
		const pg = createMockPg([{ run_id: 'run-1' }, { run_id: 'run-2' }])
		const adapter = createMockAdapter()
		const reconciler = createRabbitMqReconciler({
			adapter: adapter as any,
			pgClient: pg as any,
			statusTableName: 'status',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(2)
		expect(stats.reconciledRuns).toBe(2)
		expect(stats.failedRuns).toBe(0)
	})

	it('should handle reconciliation failure', async function () {
		const pg = createMockPg([{ run_id: 'run-1' }])
		const adapter = {
			reconcile: vi.fn().mockRejectedValue(new Error('Reconciliation failed')),
			logger: {
				info: vi.fn(),
				error: vi.fn(),
				warn: vi.fn(),
				debug: vi.fn(),
			},
		}
		const reconciler = createRabbitMqReconciler({
			adapter: adapter as any,
			pgClient: pg as any,
			statusTableName: 'status',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(1)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(1)
	})

	it('should use custom logger', function () {
		const pg = createMockPg([])
		const adapter = createMockAdapter()
		const customLogger = {
			info: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		}
		createRabbitMqReconciler({
			adapter: adapter as any,
			pgClient: pg as any,
			statusTableName: 'status',
			stalledThresholdSeconds: 300,
			logger: customLogger,
		})
	})
})

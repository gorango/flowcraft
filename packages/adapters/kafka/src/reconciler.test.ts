import { describe, expect, it, vi } from 'vitest'
import { createKafkaReconciler } from './reconciler'

function createMockCassandra(rows: any[] = []) {
	return {
		execute: vi.fn().mockImplementation(async () => ({
			rows: rows.map((r) => ({
				get: (col: string) => r[col],
			})),
		})),
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

describe('createKafkaReconciler', function () {
	it('should create reconciler', function () {
		const cassandra = createMockCassandra([])
		const adapter = createMockAdapter()
		const reconciler = createKafkaReconciler({
			adapter: adapter as any,
			cassandraClient: cassandra as any,
			keyspace: 'test',
			statusTableName: 'status',
			stalledThresholdSeconds: 300,
		})
		expect(reconciler.run).toBeDefined()
	})

	it('should return empty stats when no stalled runs', async function () {
		const cassandra = createMockCassandra([])
		const adapter = createMockAdapter()
		const reconciler = createKafkaReconciler({
			adapter: adapter as any,
			cassandraClient: cassandra as any,
			keyspace: 'test',
			statusTableName: 'status',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(0)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(0)
	})

	it('should detect and reconcile stalled runs', async function () {
		const oldTimestamp = new Date(Date.now() - 400 * 1000)
		const cassandra = createMockCassandra([
			{ run_id: 'run-1', updated_at: oldTimestamp },
			{ run_id: 'run-2', updated_at: oldTimestamp },
		])
		const adapter = createMockAdapter()
		const reconciler = createKafkaReconciler({
			adapter: adapter as any,
			cassandraClient: cassandra as any,
			keyspace: 'test',
			statusTableName: 'status',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(2)
		expect(stats.reconciledRuns).toBe(2)
		expect(stats.failedRuns).toBe(0)
	})

	it('should handle reconciliation failure', async function () {
		const oldTimestamp = new Date(Date.now() - 400 * 1000)
		const cassandra = createMockCassandra([{ run_id: 'run-1', updated_at: oldTimestamp }])
		const adapter = {
			reconcile: vi.fn().mockRejectedValue(new Error('Reconciliation failed')),
			logger: {
				info: vi.fn(),
				error: vi.fn(),
				warn: vi.fn(),
				debug: vi.fn(),
			},
		}
		const reconciler = createKafkaReconciler({
			adapter: adapter as any,
			cassandraClient: cassandra as any,
			keyspace: 'test',
			statusTableName: 'status',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(1)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(1)
	})

	it('should use custom logger', function () {
		const cassandra = createMockCassandra([])
		const adapter = createMockAdapter()
		const customLogger = {
			info: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		}
		createKafkaReconciler({
			adapter: adapter as any,
			cassandraClient: cassandra as any,
			keyspace: 'test',
			statusTableName: 'status',
			stalledThresholdSeconds: 300,
			logger: customLogger,
		})
	})
})

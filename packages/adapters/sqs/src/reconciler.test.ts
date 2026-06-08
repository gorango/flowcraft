import { describe, expect, it, vi } from 'vitest'
import { createSqsReconciler } from './reconciler'

function createMockDynamo(items: any[] = []) {
	return {
		send: vi.fn().mockImplementation(async (command) => {
			if (command.constructor.name === 'ScanCommand') {
				return {
					ScannedCount: items.length,
					Items: items,
				}
			}
			return {}
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

describe('createSqsReconciler', function () {
	it('should create reconciler', function () {
		const dynamo = createMockDynamo()
		const adapter = createMockAdapter()
		const reconciler = createSqsReconciler({
			adapter: adapter as any,
			dynamoDbClient: dynamo as any,
			statusTableName: 'status',
			stalledThresholdSeconds: 300,
		})
		expect(reconciler.run).toBeDefined()
	})

	it('should return empty stats when no stalled runs', async function () {
		const dynamo = createMockDynamo([])
		const adapter = createMockAdapter()
		const reconciler = createSqsReconciler({
			adapter: adapter as any,
			dynamoDbClient: dynamo as any,
			statusTableName: 'status',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.scannedItems).toBe(0)
		expect(stats.stalledRuns).toBe(0)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(0)
	})

	it('should detect and reconcile stalled runs', async function () {
		const oldTimestamp = Math.floor(Date.now() / 1000) - 400
		const dynamo = createMockDynamo([
			{
				runId: { S: 'run-1' },
				status: { S: 'running' },
				lastUpdated: { N: oldTimestamp.toString() },
			},
			{
				runId: { S: 'run-2' },
				status: { S: 'running' },
				lastUpdated: { N: oldTimestamp.toString() },
			},
		])
		const adapter = createMockAdapter()
		const reconciler = createSqsReconciler({
			adapter: adapter as any,
			dynamoDbClient: dynamo as any,
			statusTableName: 'status',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(2)
		expect(stats.reconciledRuns).toBe(2)
		expect(stats.failedRuns).toBe(0)
	})

	it('should handle reconciliation failure', async function () {
		const oldTimestamp = Math.floor(Date.now() / 1000) - 400
		const dynamo = createMockDynamo([
			{
				runId: { S: 'run-1' },
				status: { S: 'running' },
				lastUpdated: { N: oldTimestamp.toString() },
			},
		])
		const adapter = {
			reconcile: vi.fn().mockRejectedValue(new Error('Reconciliation failed')),
			logger: {
				info: vi.fn(),
				error: vi.fn(),
				warn: vi.fn(),
				debug: vi.fn(),
			},
		}
		const reconciler = createSqsReconciler({
			adapter: adapter as any,
			dynamoDbClient: dynamo as any,
			statusTableName: 'status',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()
		expect(stats.stalledRuns).toBe(1)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(1)
	})

	it('should use custom logger', function () {
		const dynamo = createMockDynamo([])
		const adapter = createMockAdapter()
		const customLogger = {
			info: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		}
		createSqsReconciler({
			adapter: adapter as any,
			dynamoDbClient: dynamo as any,
			statusTableName: 'status',
			stalledThresholdSeconds: 300,
			logger: customLogger,
		})
	})
})

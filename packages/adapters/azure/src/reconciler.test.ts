import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAzureReconciler } from './reconciler'

function createMockAdapter() {
	return {
		queueClient: {} as any,
		cosmosClient: {} as any,
		cosmosDatabaseName: 'test',
		contextContainerName: 'contexts',
		statusContainerName: 'statuses',
		reconcile: vi.fn().mockResolvedValue(new Set(['node-1', 'node-2'])),
	}
}

function createMockCosmosClient(hasItems = false) {
	const mockContainer = {
		items: {
			query: vi.fn().mockReturnValue({
				fetchAll: vi.fn().mockResolvedValue({
					resources: hasItems
						? [
								{ runId: 'run-1', status: 'running', lastUpdated: 1000 },
								{ runId: 'run-2', status: 'running', lastUpdated: 1000 },
							]
						: [],
				}),
			}),
		},
	}
	return {
		database: vi.fn().mockReturnValue({
			container: vi.fn().mockReturnValue(mockContainer),
		}),
	}
}

describe('createAzureReconciler - Unit Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('should create reconciler', () => {
		const adapter = createMockAdapter()
		const cosmosClient = createMockCosmosClient() as any

		const reconciler = createAzureReconciler({
			adapter,
			cosmosClient,
			cosmosDatabaseName: 'test-db',
			statusContainerName: 'statuses',
			stalledThresholdSeconds: 300,
		})

		expect(reconciler.run).toBeDefined()
	})

	it('should return empty stats when no stalled runs', async () => {
		const adapter = createMockAdapter()
		const cosmosClient = createMockCosmosClient(false) as any

		const reconciler = createAzureReconciler({
			adapter,
			cosmosClient,
			cosmosDatabaseName: 'test-db',
			statusContainerName: 'statuses',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()

		expect(stats.stalledRuns).toBe(0)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(0)
	})

	it('should detect and reconcile stalled runs', async () => {
		const adapter = createMockAdapter()
		const cosmosClient = createMockCosmosClient(true) as any

		const reconciler = createAzureReconciler({
			adapter,
			cosmosClient,
			cosmosDatabaseName: 'test-db',
			statusContainerName: 'statuses',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()

		expect(stats.stalledRuns).toBe(2)
		expect(stats.reconciledRuns).toBe(2)
		expect(stats.failedRuns).toBe(0)
	})

	it('should handle reconciliation failure', async () => {
		const adapter = {
			reconcile: vi.fn().mockRejectedValue(new Error('Reconciliation failed')),
		}
		const cosmosClient = createMockCosmosClient(true) as any

		const reconciler = createAzureReconciler({
			adapter,
			cosmosClient,
			cosmosDatabaseName: 'test-db',
			statusContainerName: 'statuses',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()

		expect(stats.stalledRuns).toBe(2)
		expect(stats.reconciledRuns).toBe(0)
		expect(stats.failedRuns).toBe(2)
	})

	it('should skip runs without runId', async () => {
		const adapter = createMockAdapter()
		const mockContainer = {
			items: {
				query: vi.fn().mockReturnValue({
					fetchAll: vi.fn().mockResolvedValue({
						resources: [{ status: 'running', lastUpdated: 1000 }],
					}),
				}),
			},
		}
		const cosmosClient = {
			database: vi.fn().mockReturnValue({
				container: vi.fn().mockReturnValue(mockContainer),
			}),
		} as any

		const reconciler = createAzureReconciler({
			adapter,
			cosmosClient,
			cosmosDatabaseName: 'test-db',
			statusContainerName: 'statuses',
			stalledThresholdSeconds: 300,
		})

		const stats = await reconciler.run()

		expect(stats.stalledRuns).toBe(0)
	})
})

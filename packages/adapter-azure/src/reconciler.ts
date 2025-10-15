import type { CosmosClient } from '@azure/cosmos'
import type { AzureQueueAdapter } from './adapter'

export interface AzureReconcilerOptions {
	/** The configured AzureQueueAdapter instance. */
	adapter: AzureQueueAdapter
	/** The Cosmos DB client to use for querying. */
	cosmosClient: CosmosClient
	/** The name of the Cosmos DB database. */
	cosmosDatabaseName: string
	/** The name of the container that stores workflow status. */
	statusContainerName: string
	/** The time in seconds a workflow must be idle to be considered stalled. */
	stalledThresholdSeconds: number
}

export interface ReconciliationStats {
	stalledRuns: number
	reconciledRuns: number
	failedRuns: number
}

/**
 * Creates a reconciler utility for Azure-based workflows.
 * It queries Cosmos DB for stalled runs and attempts to resume them.
 */
export function createAzureReconciler(options: AzureReconcilerOptions) {
	const { adapter, cosmosClient, cosmosDatabaseName, statusContainerName, stalledThresholdSeconds } = options

	return {
		async run(): Promise<ReconciliationStats> {
			const stats: ReconciliationStats = {
				stalledRuns: 0,
				reconciledRuns: 0,
				failedRuns: 0,
			}
			const thresholdTimestamp = Math.floor(Date.now() / 1000) - stalledThresholdSeconds
			const container = cosmosClient.database(cosmosDatabaseName).container(statusContainerName)

			const querySpec = {
				query: 'SELECT * FROM c WHERE c.status = @status AND c.lastUpdated < @threshold',
				parameters: [
					{ name: '@status', value: 'running' },
					{ name: '@threshold', value: thresholdTimestamp },
				],
			}

			const { resources: items } = await container.items.query(querySpec).fetchAll()

			if (!items || items.length === 0) {
				return stats
			}

			for (const item of items) {
				const runId = item.runId as string
				if (!runId) continue

				stats.stalledRuns++
				try {
					const enqueued = await (adapter as any).reconcile(runId)
					if (enqueued.size > 0) {
						stats.reconciledRuns++
						console.log(`[Reconciler] Resumed run ${runId}, enqueued nodes: ${[...enqueued].join(', ')}`)
					}
				} catch (error) {
					stats.failedRuns++
					console.error(`[Reconciler] Failed to reconcile run ${runId}:`, error)
				}
			}
			return stats
		},
	}
}

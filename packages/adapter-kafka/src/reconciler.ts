import type { Client as CassandraClient } from 'cassandra-driver'
import type { KafkaAdapter } from './adapter'

export interface KafkaReconcilerOptions {
	/** The configured KafkaAdapter instance. */
	adapter: KafkaAdapter
	/** The Cassandra client to use for querying. */
	cassandraClient: CassandraClient
	/** The Cassandra keyspace where the status table resides. */
	keyspace: string
	/** The name of the table that stores workflow status. */
	statusTableName: string
	/** The time in seconds a workflow must be idle to be considered stalled. */
	stalledThresholdSeconds: number
}

export interface ReconciliationStats {
	stalledRuns: number
	reconciledRuns: number
	failedRuns: number
}

/**
 * Creates a reconciler utility for Kafka/Cassandra-based workflows.
 * It queries Cassandra for stalled runs and attempts to resume them.
 */
export function createKafkaReconciler(options: KafkaReconcilerOptions) {
	const { adapter, cassandraClient, keyspace, statusTableName, stalledThresholdSeconds } = options

	return {
		async run(): Promise<ReconciliationStats> {
			const stats: ReconciliationStats = {
				stalledRuns: 0,
				reconciledRuns: 0,
				failedRuns: 0,
			}
			const thresholdTimestamp = new Date(Date.now() - stalledThresholdSeconds * 1000)

			// NOTE: This query requires ALLOW FILTERING and may be inefficient on large datasets.
			// For production, a dedicated table or secondary index on 'status' is recommended.
			const query = `SELECT run_id FROM ${keyspace}.${statusTableName} WHERE status = ? AND updated_at < ? ALLOW FILTERING`
			const params = ['running', thresholdTimestamp]
			const result = await cassandraClient.execute(query, params, { prepare: true })

			if (result.rows.length === 0) {
				return stats
			}

			for (const row of result.rows) {
				const runId = row.get('run_id') as string
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

import type { ILogger } from 'flowcraft'
import type { Client as PgClient } from 'pg'
import type { RabbitMqAdapter } from './adapter'

export interface RabbitMqReconcilerOptions {
	/** The configured RabbitMqAdapter instance. */
	adapter: RabbitMqAdapter
	/** The PostgreSQL client to use for querying. */
	pgClient: PgClient
	/** The name of the table that stores workflow status. */
	statusTableName: string
	/** The time in seconds a workflow must be idle to be considered stalled. */
	stalledThresholdSeconds: number
	/** Logger for reconciliation events. */
	logger?: ILogger
}

export interface ReconciliationStats {
	stalledRuns: number
	reconciledRuns: number
	failedRuns: number
}

/**
 * Creates a reconciler utility for RabbitMQ/PostgreSQL-based workflows.
 * It queries PostgreSQL for stalled runs and attempts to resume them.
 */
export function createRabbitMqReconciler(options: RabbitMqReconcilerOptions) {
	const { adapter, pgClient, statusTableName, stalledThresholdSeconds, logger = (adapter as any).logger } = options

	return {
		async run(): Promise<ReconciliationStats> {
			const stats: ReconciliationStats = {
				stalledRuns: 0,
				reconciledRuns: 0,
				failedRuns: 0,
			}

			const query = `
				SELECT run_id FROM ${statusTableName}
				WHERE status = 'running' AND updated_at < NOW() - INTERVAL '${stalledThresholdSeconds} seconds'
			`
			const res = await pgClient.query(query)

			if (res.rows.length === 0) {
				return stats
			}

			for (const row of res.rows) {
				const runId = row.run_id as string
				if (!runId) continue

				stats.stalledRuns++
				try {
					const enqueued = await (adapter as any).reconcile(runId)
					if (enqueued.size > 0) {
						stats.reconciledRuns++
						logger.info(`[Reconciler] Resumed run ${runId}, enqueued nodes: ${[...enqueued].join(', ')}`)
					}
				} catch (error) {
					stats.failedRuns++
					logger.error(`[Reconciler] Failed to reconcile run ${runId}:`, error)
				}
			}
			return stats
		},
	}
}

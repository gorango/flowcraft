import type { Redis } from 'ioredis'
import type { BullMQAdapter } from './adapter'

export interface BullMQReconcilerOptions {
	/** The configured BullMQAdapter instance. */
	adapter: BullMQAdapter
	/** The Redis client to use for scanning keys. */
	redis: Redis
	/** The time in seconds a workflow must be idle to be considered stalled. */
	stalledThresholdSeconds: number
	/** The prefix for workflow state keys in Redis. */
	keyPrefix?: string
	/** The maximum number of keys to fetch in each SCAN batch. */
	scanCount?: number
}

export interface ReconciliationStats {
	scannedKeys: number
	stalledRuns: number
	reconciledRuns: number
	failedRuns: number
}

/**
 * Creates a reconciler utility for BullMQ-based workflows.
 * This utility scans Redis for potentially stalled workflows and attempts to resume them.
 *
 * @returns An object with a `run` method to execute the reconciliation cycle.
 */
export function createBullMQReconciler(options: BullMQReconcilerOptions) {
	const { adapter, redis, stalledThresholdSeconds, keyPrefix = 'workflow:state:', scanCount = 100 } = options

	return {
		async run(): Promise<ReconciliationStats> {
			const stats: ReconciliationStats = {
				scannedKeys: 0,
				stalledRuns: 0,
				reconciledRuns: 0,
				failedRuns: 0,
			}

			let cursor = 0
			do {
				const result = await redis.scan(cursor, 'MATCH', `${keyPrefix}*`, 'COUNT', scanCount)
				cursor = Number(result[0])
				const keys = result[1]

				for (const key of keys) {
					stats.scannedKeys++
					const runId = key.replace(keyPrefix, '')
					const idleTime = await redis.object('IDLETIME', key)

					if (idleTime !== null && idleTime !== undefined && Number(idleTime) > stalledThresholdSeconds) {
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
				}
			} while (cursor !== 0)
			return stats
		},
	}
}

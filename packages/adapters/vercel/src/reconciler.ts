import type { VercelQueueAdapter } from './adapter'
import type { Redis } from 'ioredis'

export interface VercelReconcilerOptions {
	adapter: VercelQueueAdapter
	redisClient: Redis
	statusKeyPrefix?: string
	stalledThresholdSeconds: number
	logger?: {
		info: (message: string, meta?: Record<string, any>) => void
		error: (message: string, meta?: Record<string, any>) => void
	}
}

export interface ReconciliationStats {
	stalledRuns: number
	reconciledRuns: number
	failedRuns: number
}

export function createVercelReconciler(options: VercelReconcilerOptions) {
	const {
		adapter,
		redisClient,
		statusKeyPrefix = 'flowcraft:status:',
		stalledThresholdSeconds,
		logger = (adapter as any).logger,
	} = options

	return {
		async run(): Promise<ReconciliationStats> {
			const stats: ReconciliationStats = {
				stalledRuns: 0,
				reconciledRuns: 0,
				failedRuns: 0,
			}

			const thresholdTimestamp = Math.floor(Date.now() / 1000) - stalledThresholdSeconds

			const keys = await redisClient.keys(`${statusKeyPrefix}*`)
			const stalledRunIds: string[] = []

			for (const key of keys) {
				const runId = key.replace(statusKeyPrefix, '')
				const statusJson = await redisClient.get(key)

				if (!statusJson) continue

				try {
					const status = JSON.parse(statusJson)
					if (status.status === 'running' && status.lastUpdated < thresholdTimestamp) {
						stalledRunIds.push(runId)
					}
				} catch (parseError) {
					logger?.warn(`[VercelReconciler] Failed to parse status for run ${runId}:`, {
						parseError,
					})
				}
			}

			if (stalledRunIds.length === 0) {
				return stats
			}

			logger?.info(`[VercelReconciler] Found ${stalledRunIds.length} stalled runs`)

			for (const runId of stalledRunIds) {
				stats.stalledRuns++
				try {
					const enqueued = await (adapter as any).reconcile(runId)
					if (enqueued.size > 0) {
						stats.reconciledRuns++
						logger?.info(
							`[VercelReconciler] Resumed run ${runId}, enqueued nodes: ${[...enqueued].join(', ')}`,
						)
					}
				} catch (error) {
					stats.failedRuns++
					logger?.error(`[VercelReconciler] Failed to reconcile run ${runId}:`, {
						error,
					})
				}
			}

			return stats
		},
	}
}

import type { Firestore } from '@google-cloud/firestore'
import type { ILogger } from 'flowcraft'
import type { PubSubAdapter } from './adapter'

export interface GcpReconcilerOptions {
	/** The configured PubSubAdapter instance. */
	adapter: PubSubAdapter
	/** The Firestore client to use for querying. */
	firestoreClient: Firestore
	/** The name of the Firestore collection that stores workflow status. */
	statusCollectionName: string
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
 * Creates a reconciler utility for GCP-based workflows.
 * It queries Firestore for stalled runs and attempts to resume them.
 */
export function createGcpReconciler(options: GcpReconcilerOptions) {
	const {
		adapter,
		firestoreClient,
		statusCollectionName,
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
			const thresholdDate = new Date(Date.now() - stalledThresholdSeconds * 1000)

			const query = firestoreClient
				.collection(statusCollectionName)
				.where('status', '==', 'running')
				.where('lastUpdated', '<', thresholdDate)

			const snapshot = await query.get()

			if (snapshot.empty) {
				return stats
			}

			for (const doc of snapshot.docs) {
				const runId = doc.id
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

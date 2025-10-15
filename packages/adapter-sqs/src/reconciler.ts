import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { ScanCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import type { SqsAdapter } from './adapter'

export interface SqsReconcilerOptions {
	/** The configured SqsAdapter instance. */
	adapter: SqsAdapter
	/** The DynamoDB client to use for querying. */
	dynamoDbClient: DynamoDBClient
	/** The name of the DynamoDB table that stores workflow status. */
	statusTableName: string
	/** The time in seconds a workflow must be idle to be considered stalled. */
	stalledThresholdSeconds: number
}

// Re-using the same stats interface
export interface ReconciliationStats {
	scannedItems: number
	stalledRuns: number
	reconciledRuns: number
	failedRuns: number
}

/**
 * Creates a reconciler utility for SQS/DynamoDB-based workflows.
 * It queries a DynamoDB status table for stalled runs and attempts to resume them.
 */
export function createSqsReconciler(options: SqsReconcilerOptions) {
	const { adapter, dynamoDbClient, statusTableName, stalledThresholdSeconds } = options

	return {
		async run(): Promise<ReconciliationStats> {
			const stats: ReconciliationStats = {
				scannedItems: 0,
				stalledRuns: 0,
				reconciledRuns: 0,
				failedRuns: 0,
			}
			const thresholdTimestamp = Math.floor(Date.now() / 1000) - stalledThresholdSeconds

			const scanCommand = new ScanCommand({
				TableName: statusTableName,
				FilterExpression: '#s = :running AND #lu < :threshold',
				ExpressionAttributeNames: {
					'#s': 'status',
					'#lu': 'lastUpdated',
				},
				ExpressionAttributeValues: {
					':running': { S: 'running' },
					':threshold': { N: thresholdTimestamp.toString() },
				},
			})

			const result = await dynamoDbClient.send(scanCommand)
			stats.scannedItems = result.ScannedCount || 0

			if (!result.Items || result.Items.length === 0) {
				return stats
			}

			for (const item of result.Items) {
				const unmarshalled = unmarshall(item)
				const runId = unmarshalled.runId as string
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

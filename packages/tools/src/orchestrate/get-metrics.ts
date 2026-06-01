import { z } from 'zod'
import type { WorkflowTool, EventStore } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import { getCompletedNodes, getNodeErrors, getExecutionStatus, getEventProp } from '../utils/events'

const getExecutionMetricsSchema = z.object({
	executionId: z.string().describe('The execution ID'),
	includeHistory: z.boolean().optional().default(false).describe('Include historical comparison'),
})

export function createGetExecutionMetricsTool(config: {
	eventStore: EventStore
}): WorkflowTool<typeof getExecutionMetricsSchema> {
	return createWorkflowTool({
		name: 'get_execution_metrics',
		description:
			'Get aggregate execution metrics including timing, error counts, retry counts, and node performance',
		parameters: getExecutionMetricsSchema,
		triggers: ['metrics', 'stats', 'success rate', 'duration', 'cost', 'performance'],
		execute: async (params) => {
			const start = Date.now()

			try {
				const events = await config.eventStore.retrieve(params.executionId)
				const typedEvents = events as unknown[]

				if (typedEvents.length === 0) {
					return {
						status: 'failed',
						error: {
							message: `No events found for execution ${params.executionId}`,
							code: ErrorCodes.EXECUTION_NOT_FOUND,
						},
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: '',
						},
					}
				}

				const status = getExecutionStatus(typedEvents)
				const completedNodes = getCompletedNodes(typedEvents)
				const errors = getNodeErrors(typedEvents)

				const workflowStart =
					getEventProp<number>(
						typedEvents.find(
							(e) => getEventProp<string>(e, 'type') === 'workflow:start',
						),
						'timestamp',
					) ?? 0
				const workflowEnd =
					getEventProp<number>(
						typedEvents.find(
							(e) => getEventProp<string>(e, 'type') === 'workflow:finish',
						),
						'timestamp',
					) ?? 0
				const workflowDuration =
					workflowStart && workflowEnd ? workflowEnd - workflowStart : 0

				let nodeCount = 0
				let retryCount = 0
				let fallbackCount = 0
				const allNodeTimings: Array<{ nodeId: string; duration: number }> = []

				for (const event of typedEvents) {
					const type = getEventProp<string>(event, 'type')
					if (type === 'node:start') nodeCount++
					if (type === 'node:retry') retryCount++
					if (type === 'node:fallback') fallbackCount++
				}

				for (const nid of completedNodes) {
					const startEvent = typedEvents.find(
						(e) =>
							getEventProp<string>(e, 'type') === 'node:start' &&
							getEventProp<string>(e, 'nodeId') === nid,
					)
					const finishEvent = typedEvents.find(
						(e) =>
							getEventProp<string>(e, 'type') === 'node:finish' &&
							getEventProp<string>(e, 'nodeId') === nid,
					)
					if (startEvent && finishEvent) {
						const startTs = getEventProp<number>(startEvent, 'timestamp') ?? 0
						const endTs = getEventProp<number>(finishEvent, 'timestamp') ?? 0
						if (endTs > startTs) {
							allNodeTimings.push({ nodeId: nid, duration: endTs - startTs })
						}
					}
				}

				allNodeTimings.sort((a, b) => b.duration - a.duration)

				const totalDuration = allNodeTimings.reduce((sum, n) => sum + n.duration, 0)
				const avgNodeDuration =
					allNodeTimings.length > 0 ? totalDuration / allNodeTimings.length : 0

				return {
					status: 'completed',
					data: {
						executionId: params.executionId,
						duration: workflowDuration,
						nodeCount,
						errorCount: errors.length,
						retryCount,
						fallbackCount,
						nodesCompleted: completedNodes.length,
						nodesFailed: errors.filter((e) => !completedNodes.includes(e.nodeId))
							.length,
						averageNodeDuration: Math.round(avgNodeDuration),
						slowestNode: allNodeTimings[0] ?? null,
						fastestNode: allNodeTimings[allNodeTimings.length - 1] ?? null,
						status,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: completedNodes,
						blueprintId: status.blueprintId ?? '',
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: { duration: Date.now() - start, affectedNodes: [], blueprintId: '' },
				}
			}
		},
	})
}

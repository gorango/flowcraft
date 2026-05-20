import { z } from 'zod'
import type { WorkflowTool, EventStore } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import { getCompletedNodes, getNodeErrors, getExecutionStatus, getEventProp } from '../utils/events'

const getExecutionTimelineSchema = z.object({
	executionId: z.string().describe('The execution ID'),
	includeInternal: z.boolean().optional().default(false).describe('Include internal node events'),
})

export function createGetExecutionTimelineTool(config: {
	eventStore: EventStore
}): WorkflowTool<typeof getExecutionTimelineSchema> {
	return createWorkflowTool({
		name: 'get_execution_timeline',
		description:
			'Get a detailed timeline of node execution events with timestamps and durations',
		parameters: getExecutionTimelineSchema,
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
				const allNodeIds = new Set<string>()
				const nodeStartTimes = new Map<string, number>()
				const nodeEndTimes = new Map<string, number>()
				const nodeErrors = new Map<string, string>()
				const nodeRetries = new Map<string, number>()

				for (const event of typedEvents) {
					const type = getEventProp<string>(event, 'type')
					const nodeId = getEventProp<string>(event, 'nodeId')
					if (!nodeId) continue

					allNodeIds.add(nodeId)

					if (type === 'node:start') {
						const timestamp = getEventProp<string | number>(event, 'timestamp')
						if (!nodeStartTimes.has(nodeId)) {
							nodeStartTimes.set(
								nodeId,
								typeof timestamp === 'number' ? timestamp : Date.now(),
							)
						}
						nodeRetries.set(nodeId, (nodeRetries.get(nodeId) ?? -1) + 1)
					}

					if (type === 'node:finish' || type === 'node:error') {
						const timestamp = getEventProp<string | number>(event, 'timestamp')
						nodeEndTimes.set(
							nodeId,
							typeof timestamp === 'number' ? timestamp : Date.now(),
						)
						if (type === 'node:error') {
							const error = getEventProp<Record<string, unknown>>(event, 'error')
							nodeErrors.set(
								nodeId,
								error?.message ? String(error.message) : 'Unknown error',
							)
						}
					}
				}

				const nodes = Array.from(allNodeIds).map((nodeId) => {
					const startTs = nodeStartTimes.get(nodeId)
					const endTs = nodeEndTimes.get(nodeId)
					const nodeStat = endTs ? 'completed' : startTs ? 'running' : 'pending'

					return {
						nodeId,
						status: nodeErrors.has(nodeId) ? 'failed' : nodeStat,
						startedAt: startTs ? new Date(startTs).toISOString() : undefined,
						finishedAt: endTs ? new Date(endTs).toISOString() : undefined,
						duration: startTs && endTs ? endTs - startTs : undefined,
						retries: nodeRetries.get(nodeId) ?? 0,
						error: nodeErrors.get(nodeId),
					}
				})

				const completedNodes = getCompletedNodes(typedEvents)
				const errors = getNodeErrors(typedEvents)
				const startTs = getEventProp<string | number>(typedEvents[0], 'timestamp')
				const lastEvent = typedEvents[typedEvents.length - 1]
				const endTs = getEventProp<string | number>(lastEvent, 'timestamp')

				return {
					status: 'completed',
					data: {
						executionId: params.executionId,
						status: status.status,
						startedAt: startTs
							? new Date(
									typeof startTs === 'number' ? startTs : Date.now(),
								).toISOString()
							: undefined,
						finishedAt: endTs
							? new Date(typeof endTs === 'number' ? endTs : Date.now()).toISOString()
							: undefined,
						duration:
							startTs && endTs
								? (typeof endTs === 'number' ? endTs : Date.now()) -
									(typeof startTs === 'number' ? startTs : Date.now())
								: Date.now() - start,
						nodes,
						totalNodeCount: allNodeIds.size,
						completedNodeCount: completedNodes.length,
						errorCount: errors.length,
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

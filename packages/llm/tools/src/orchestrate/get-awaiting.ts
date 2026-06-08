import { z } from 'zod'
import type { WorkflowTool, EventStore } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import { getExecutionStatus, getAwaitingNodesInfo } from '../utils/events'

const getAwaitingNodesSchema = z.object({
	executionId: z.string().describe('The execution ID'),
})

export function createGetAwaitingNodesTool(config: {
	eventStore: EventStore
}): WorkflowTool<typeof getAwaitingNodesSchema> {
	return createWorkflowTool({
		name: 'get_awaiting_nodes',
		description:
			'List all nodes in a workflow execution that are waiting for human input or an external event',
		parameters: getAwaitingNodesSchema,
		triggers: ['awaiting', 'waiting', 'pending nodes', 'what is waiting', 'stuck nodes'],
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
				const awaitingNodes = getAwaitingNodesInfo(typedEvents)

				const details = awaitingNodes.map((n) => {
					const reason = detectAwaitReason(n.details)
					return {
						nodeId: n.nodeId,
						reason,
						wakeUpAt: n.details.wakeUpAt as string | undefined,
						blueprintId: n.details.blueprintId as string | undefined,
					}
				})

				return {
					status: 'completed',
					data: {
						awaiting: awaitingNodes.length > 0,
						awaitingNodeIds: awaitingNodes.map((n) => n.nodeId),
						details,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: status.blueprintId ?? '',
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: '',
					},
				}
			}
		},
	})
}

function detectAwaitReason(details: Record<string, unknown>): string {
	if (details.reason === 'timer' || details.wakeUpAt) return 'timer'
	if (details.reason === 'external_event') return 'external_event'
	if (details.blueprintId) return 'subflow'
	return 'human_input'
}

import { z } from 'zod'
import type { WorkflowTool, EventStore } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import { getNodeErrorEvents, getNodeRetryHistory } from '../utils/events'

const getNodeErrorSchema = z.object({
	executionId: z.string().describe('The execution ID'),
	nodeId: z.string().describe('The node ID'),
})

export function createGetNodeErrorTool(config: {
	eventStore: EventStore
}): WorkflowTool<typeof getNodeErrorSchema> {
	return createWorkflowTool({
		name: 'get_node_error',
		description: 'Get detailed error information from a failed node in a workflow execution',
		parameters: getNodeErrorSchema,
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

				const errorEvents = getNodeErrorEvents(typedEvents, params.nodeId)
				const retryHistory = getNodeRetryHistory(typedEvents, params.nodeId)

				if (errorEvents.length === 0) {
					return {
						status: 'completed',
						data: {
							hasError: false,
							retryCount: retryHistory.length,
							attempts: retryHistory,
						},
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: '',
						},
					}
				}

				const latestError = errorEvents[errorEvents.length - 1]
				const errorPayload = (latestError.error ?? {}) as Record<string, unknown>

				return {
					status: 'completed',
					data: {
						hasError: true,
						error: {
							message: (errorPayload.message as string) ?? 'Unknown error',
							nodeId: params.nodeId,
							isFatal: (errorPayload.isFatal as boolean) ?? false,
						},
						retryCount: retryHistory.length,
						attempts: retryHistory,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: '',
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

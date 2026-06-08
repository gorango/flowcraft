import { z } from 'zod'
import type { WorkflowTool, EventStore } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import { getNodeFinishEvent, getNodeErrorEvents } from '../utils/events'

const getNodeOutputSchema = z.object({
	executionId: z.string().describe('The execution ID'),
	nodeId: z.string().describe('The node ID to get output for'),
})

export function createGetNodeOutputTool(config: {
	eventStore: EventStore
}): WorkflowTool<typeof getNodeOutputSchema> {
	return createWorkflowTool({
		name: 'get_node_output',
		description: 'Retrieve the output produced by a completed node in a workflow execution',
		parameters: getNodeOutputSchema,
		triggers: ['node output', 'get result', 'output value', 'node result', 'read output'],
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

				const finishEvent = getNodeFinishEvent(typedEvents, params.nodeId)

				if (!finishEvent) {
					const errorEvents = getNodeErrorEvents(typedEvents, params.nodeId)
					if (errorEvents.length > 0) {
						return {
							status: 'failed',
							error: {
								message: `Node '${params.nodeId}' failed with an error`,
								code: ErrorCodes.NODE_NOT_EXECUTED,
							},
							metadata: {
								duration: Date.now() - start,
								affectedNodes: [],
								blueprintId: '',
							},
						}
					}

					return {
						status: 'failed',
						error: {
							message: `Node '${params.nodeId}' has not been executed yet`,
							code: ErrorCodes.NODE_NOT_EXECUTED,
						},
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: '',
						},
					}
				}

				const result = finishEvent.result as Record<string, unknown> | undefined
				const output = result?.output as unknown | undefined

				return {
					status: 'completed',
					data: {
						nodeId: params.nodeId,
						output,
						hasOutput: output !== undefined,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [params.nodeId],
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

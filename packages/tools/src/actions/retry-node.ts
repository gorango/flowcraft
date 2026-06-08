import { z } from 'zod'
import type { WorkflowTool, EventStore, FlowcraftRuntime, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import { getNodeErrorEvents, getEventProp } from '../utils/events'

const retryNodeSchema = z.object({
	executionId: z.string().describe('The execution ID'),
	nodeId: z.string().describe('The node ID to retry'),
	workflowId: z
		.string()
		.optional()
		.describe('Blueprint ID (required if not inferable from events)'),
	version: z.string().optional().describe('Blueprint version'),
	inputs: z.record(z.string(), z.unknown()).optional().describe('Override inputs for the retry'),
})

export function createRetryNodeTool(config: {
	eventStore: EventStore
	runtime: FlowcraftRuntime
	resolver: BlueprintResolver
}): WorkflowTool<typeof retryNodeSchema> {
	return createWorkflowTool({
		name: 'retry_node',
		description:
			'Re-execute a failed node in a workflow execution to recover from transient errors',
		parameters: retryNodeSchema,
		triggers: ['retry node', 'rerun node', 'retry single node', 'recover node'],
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
				if (errorEvents.length === 0) {
					return {
						status: 'failed',
						error: {
							message: `Node '${params.nodeId}' has not failed and cannot be retried`,
							code: ErrorCodes.NODE_NOT_FAILED,
						},
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: '',
						},
					}
				}

				let blueprintId = params.workflowId
				if (!blueprintId) {
					const startEvent = typedEvents.find(
						(e) => getEventProp<string>(e, 'type') === 'workflow:start',
					)
					const startPayload = (startEvent as Record<string, unknown>)?.payload as
						| Record<string, unknown>
						| undefined
					blueprintId = startPayload?.blueprintId as string
					if (!blueprintId) {
						return {
							status: 'failed',
							error: {
								message: 'Cannot determine blueprint from events. Provide workflowId.',
								code: ErrorCodes.BLUEPRINT_NOT_FOUND,
							},
							metadata: {
								duration: Date.now() - start,
								affectedNodes: [],
								blueprintId: '',
							},
						}
					}
				}

				const { blueprint } = await config.resolver.resolve({
					id: blueprintId,
					version: params.version,
				})

				const inputOverrides = params.inputs ? { [params.nodeId]: params.inputs } : undefined

				const result = await config.runtime.executeNodes(
					blueprint,
					params.executionId,
					[params.nodeId],
					events,
					inputOverrides ? { inputOverrides } : undefined,
				)

				return {
					status: result.status === 'failed' ? 'failed' : 'completed',
					data: {
						executionId: params.executionId,
						retriedNodes: [params.nodeId],
						context: result.context,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [params.nodeId],
						blueprintId: blueprint.id,
						blueprintVersion: blueprint.metadata?.version,
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: params.workflowId ?? '',
					},
				}
			}
		},
	})
}

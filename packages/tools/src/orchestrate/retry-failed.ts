import { z } from 'zod'
import type { WorkflowTool, EventStore, FlowcraftRuntime, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'
import { getNodeErrors } from '../utils/events'
import { ErrorCodes } from '../utils/errors'

const retryFailedNodesSchema = z.object({
	executionId: z.string().describe('The execution ID'),
	workflowId: z
		.string()
		.optional()
		.describe('Blueprint ID (required if not inferable from events)'),
	version: z.string().optional().describe('Blueprint version'),
	nodeIds: z
		.array(z.string())
		.optional()
		.describe('Specific nodes to retry (defaults to all failed nodes)'),
})

export function createRetryFailedNodesTool(config: {
	eventStore: EventStore
	runtime: FlowcraftRuntime
	resolver: BlueprintResolver
}): WorkflowTool<typeof retryFailedNodesSchema> {
	return createWorkflowTool({
		name: 'retry_failed_nodes',
		description:
			'Retry all failed nodes in a workflow execution, or specific nodes if provided',
		parameters: retryFailedNodesSchema,
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
							nodesExecuted: [],
							blueprintId: '',
						},
					}
				}

				const allFailedErrors = getNodeErrors(typedEvents)
				const failedNodeIds = [...new Set(allFailedErrors.map((e) => e.nodeId))]

				const targetNodeIds = params.nodeIds ?? failedNodeIds

				if (targetNodeIds.length === 0) {
					return {
						status: 'completed',
						data: {
							executionId: params.executionId,
							retriedNodes: [],
							message: 'No failed nodes to retry',
						},
						metadata: {
							duration: Date.now() - start,
							nodesExecuted: [],
							blueprintId: '',
						},
					}
				}

				const nodesNotFailed = targetNodeIds.filter((id) => !failedNodeIds.includes(id))
				if (nodesNotFailed.length > 0) {
					return {
						status: 'failed',
						error: {
							message: `Nodes have not failed and cannot be retried: ${nodesNotFailed.join(', ')}`,
							code: ErrorCodes.NODE_NOT_FAILED,
						},
						metadata: {
							duration: Date.now() - start,
							nodesExecuted: [],
							blueprintId: '',
						},
					}
				}

				let blueprintId = params.workflowId
				if (!blueprintId) {
					const startEvent = typedEvents.find(
						(e) => (e as Record<string, unknown>).type === 'workflow:start',
					)
					const startPayload = (startEvent as Record<string, unknown>)?.payload as
						| Record<string, unknown>
						| undefined
					blueprintId = startPayload?.blueprintId as string
					if (!blueprintId) {
						return {
							status: 'failed',
							error: {
								message: 'Cannot determine blueprint from events',
								code: ErrorCodes.BLUEPRINT_NOT_FOUND,
							},
							metadata: {
								duration: Date.now() - start,
								nodesExecuted: [],
								blueprintId: '',
							},
						}
					}
				}

				const { blueprint } = await config.resolver.resolve({
					id: blueprintId,
					version: params.version,
				})

				const result = await config.runtime.executeNodes(
					blueprint,
					params.executionId,
					targetNodeIds,
					events,
				)

				const results = targetNodeIds.map((nodeId) => {
					return {
						nodeId,
						success: result.status !== 'failed',
						output: (result.context as Record<string, unknown>)?.[nodeId],
					}
				})

				return {
					status: result.status === 'failed' ? 'failed' : 'completed',
					data: {
						executionId: params.executionId,
						retriedNodes: targetNodeIds,
						results,
						context: result.context,
					},
					metadata: {
						duration: Date.now() - start,
						nodesExecuted: targetNodeIds,
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
						nodesExecuted: [],
						blueprintId: params.workflowId ?? '',
					},
				}
			}
		},
	})
}

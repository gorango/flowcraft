import { z } from 'zod'
import type { WorkflowTool, FlowcraftRuntime, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'

const executeNodesUpToSchema = z.object({
	workflowId: z.string().describe('The workflow blueprint ID'),
	targetNodeId: z.string().describe('Execute up to (and including) this node, then pause'),
	version: z.string().optional(),
	params: z.record(z.string(), z.unknown()).default({}).describe('Initial context'),
})

export function createExecuteNodesUpToTool(config: {
	runtime: FlowcraftRuntime
	resolver: BlueprintResolver
}): WorkflowTool<typeof executeNodesUpToSchema> {
	return createWorkflowTool({
		name: 'execute_nodes_up_to',
		description: 'Execute a workflow up to a specific node, pausing after that node completes',
		parameters: executeNodesUpToSchema,
		execute: async (params) => {
			const start = Date.now()

			try {
				const { blueprint, version } = await config.resolver.resolve({
					id: params.workflowId,
					version: params.version,
				})

				const node = blueprint.nodes.find((n) => n.id === params.targetNodeId)
				if (!node) {
					return {
						status: 'failed',
						error: {
							message: `Target node '${params.targetNodeId}' not found in blueprint`,
							code: ErrorCodes.NODE_NOT_FOUND,
						},
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: blueprint.id,
						},
					}
				}

				const result = await config.runtime.run(blueprint, {
					...params.params,
					_targetNode: params.targetNodeId,
				})

				const ctx = result.context

				return {
					status: result.status as 'completed' | 'failed' | 'awaiting',
					data: {
						context: ctx,
						targetNodeId: params.targetNodeId,
						targetReached:
							params.targetNodeId in
							((ctx._outputs as Record<string, unknown>) ?? {}),
					},
					executionId: ctx._executionId as string | undefined,
					awaitingNodeIds: result.context._awaitingNodeIds,
					awaitingDetails: result.context._awaitingDetails,
					metadata: {
						duration: Date.now() - start,
						affectedNodes: Object.keys((ctx._outputs as Record<string, unknown>) ?? {}),
						blueprintId: blueprint.id,
						blueprintVersion: version ?? blueprint.metadata?.version,
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: params.workflowId,
					},
				}
			}
		},
	})
}

import { z } from 'zod'
import type { WorkflowTool, FlowcraftRuntime, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'

const executeNodeBatchSchema = z.object({
	workflowId: z.string().describe('The workflow blueprint ID'),
	nodeIds: z
		.array(z.string())
		.min(1)
		.describe('Node IDs to execute (their predecessors must already be completed)'),
	version: z.string().optional().describe('Blueprint version'),
	params: z
		.record(z.string(), z.unknown())
		.default({})
		.describe('Initial context data for the workflow'),
})

export function createExecuteNodeBatchTool(config: {
	runtime: FlowcraftRuntime
	resolver: BlueprintResolver
}): WorkflowTool<typeof executeNodeBatchSchema> {
	return createWorkflowTool({
		name: 'execute_node_batch',
		description:
			'Execute a workflow targeting specific nodes, running all required predecessors to reach them',
		parameters: executeNodeBatchSchema,
		execute: async (params) => {
			const start = Date.now()

			try {
				const { blueprint, version } = await config.resolver.resolve({
					id: params.workflowId,
					version: params.version,
				})

				const allNodeIds = blueprint.nodes.map((n) => n.id)
				const invalidNodes = params.nodeIds.filter((id) => !allNodeIds.includes(id))
				if (invalidNodes.length > 0) {
					return {
						status: 'failed',
						error: {
							message: `Nodes not found in blueprint: ${invalidNodes.join(', ')}`,
						},
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: blueprint.id,
						},
					}
				}

				const executionId = crypto.randomUUID()
				const runResult = await config.runtime.run(blueprint, {
					...params.params,
					_targetNode: params.nodeIds,
				})

				const ctx = runResult.context
				const completedNodes = Object.keys(ctx._outputs ?? {})

				return {
					status: runResult.status as 'completed' | 'failed' | 'awaiting',
					data: {
						executionId: ctx._executionId ?? executionId,
						requestedNodes: params.nodeIds,
						completedNodes,
						context: ctx,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: completedNodes,
						blueprintId: blueprint.id,
						blueprintVersion: version,
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

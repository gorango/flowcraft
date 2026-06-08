import { z } from 'zod'
import type { WorkflowTool, FlowcraftRuntime, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'

const pauseBeforeNodeSchema = z.object({
	workflowId: z.string().describe('The workflow blueprint ID'),
	nodeId: z.string().describe('The node to pause before'),
	version: z.string().optional().describe('Blueprint version'),
	context: z.record(z.string(), z.unknown()).optional().describe('Initial context data'),
	reason: z.string().describe('Why the pause is needed'),
})

export function createPauseBeforeNodeTool(config: {
	runtime: FlowcraftRuntime
	resolver: BlueprintResolver
}): WorkflowTool<typeof pauseBeforeNodeSchema> {
	return createWorkflowTool({
		name: 'pause_before_node',
		description: 'Set a breakpoint before a specific node to pause the workflow for inspection',
		parameters: pauseBeforeNodeSchema,
		triggers: ['breakpoint', 'pause before', 'debug node', 'stop before', 'inspect before'],
		execute: async (params) => {
			const start = Date.now()

			try {
				const { blueprint, version } = await config.resolver.resolve({
					id: params.workflowId,
					version: params.version,
				})

				const node = blueprint.nodes.find((n) => n.id === params.nodeId)
				if (!node) {
					return {
						status: 'failed',
						error: {
							message: `Node '${params.nodeId}' not found in blueprint`,
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
					...params.context,
					_targetNode: params.nodeId,
				})

				const ctx = result.context

				return {
					status: result.status as 'completed' | 'failed' | 'awaiting',
					data: {
						pausedBefore: params.nodeId,
						reason: params.reason,
						context: ctx,
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

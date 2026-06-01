import { z } from 'zod'
import type { WorkflowTool, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'
import { isInternalNode } from '../types'
import { ErrorCodes } from '../utils/errors'

const getNodeInfoSchema = z.object({
	workflowId: z.string().describe('The workflow blueprint ID'),
	version: z.string().optional().describe('Blueprint version'),
	nodeId: z.string().describe('The node ID to inspect'),
})

export function createGetNodeInfoTool(config: {
	resolver: BlueprintResolver
}): WorkflowTool<typeof getNodeInfoSchema> {
	return createWorkflowTool({
		name: 'get_node_info',
		description:
			'Get the definition, configuration, and metadata for a specific node in a workflow blueprint',
		parameters: getNodeInfoSchema,
		triggers: [
			'node info',
			'node definition',
			'what is this node',
			'inspect node',
			'show node details',
		],
		execute: async (params) => {
			const start = Date.now()

			try {
				const { blueprint } = await config.resolver.resolve({
					id: params.workflowId,
					version: params.version,
				})

				const node = blueprint.nodes.find((n) => n.id === params.nodeId)
				if (!node) {
					return {
						status: 'failed',
						error: {
							message: `Node '${params.nodeId}' not found in blueprint '${params.workflowId}'`,
							code: ErrorCodes.NODE_NOT_FOUND,
						},
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: blueprint.id,
						},
					}
				}

				const incomingEdges = blueprint.edges
					.filter((e) => e.target === params.nodeId)
					.map((e) => ({
						source: e.source,
						action: e.action,
						condition: e.condition,
					}))

				const outgoingEdges = blueprint.edges
					.filter((e) => e.source === params.nodeId)
					.map((e) => ({
						target: e.target,
						action: e.action,
						condition: e.condition,
					}))

				const nodeRecord = node

				return {
					status: 'completed',
					data: {
						id: node.id,
						uses: node.uses,
						params: nodeRecord.params,
						inputs: node.inputs,
						config: node.config,
						incomingEdges,
						outgoingEdges,
						isInternal: isInternalNode(node.uses),
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [node.id],
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
						blueprintId: params.workflowId,
					},
				}
			}
		},
	})
}

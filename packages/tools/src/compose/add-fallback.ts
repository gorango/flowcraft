import { z } from 'zod'
import type { WorkflowBlueprint } from 'flowcraft'
import type { WorkflowTool } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import { nodeId } from './helpers'

const addFallbackNodeSchema = z.object({
	blueprint: z
		.object({ id: z.string(), nodes: z.array(z.unknown()), edges: z.array(z.unknown()) })
		.describe('The blueprint'),
	nodeId: z.string().describe('Node to add fallback to'),
	fallbackUses: z.string().describe('The uses key for the fallback node implementation'),
	fallbackParams: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('Parameters for fallback node'),
})

export function createAddFallbackNodeTool(): WorkflowTool<typeof addFallbackNodeSchema> {
	return createWorkflowTool({
		name: 'add_fallback_node',
		description:
			"Add a fallback node with error recovery routing to a workflow node. The fallback node is a terminal error handler — it does not wire its output to the original node's successors.",
		parameters: addFallbackNodeSchema,
		execute: async (params) => {
			const start = Date.now()

			try {
				const blueprint = params.blueprint as unknown as WorkflowBlueprint
				const targetNode = blueprint.nodes.find((n) => nodeId(n) === params.nodeId)

				if (!targetNode) {
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

				const fallbackNodeId = `${params.nodeId}_fallback`
				const existing = blueprint.nodes.find((n) => nodeId(n) === fallbackNodeId)
				if (existing) {
					return {
						status: 'failed',
						error: {
							message: `Fallback node '${fallbackNodeId}' already exists`,
							code: ErrorCodes.INVALID_OPERATION,
						},
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: blueprint.id,
						},
					}
				}

				const targetRecord = targetNode as unknown as Record<string, unknown>
				const targetInputs = targetNode.inputs
				const existingConfig = (targetRecord.config as Record<string, unknown>) ?? {}

				const fallbackNode = {
					id: fallbackNodeId,
					uses: params.fallbackUses,
					inputs: targetInputs,
					params: params.fallbackParams,
				}

				const updatedTarget = {
					...targetNode,
					config: {
						...existingConfig,
						fallback: params.fallbackUses,
					},
				}

				const modifiedNodes = blueprint.nodes.map((n) =>
					nodeId(n) === params.nodeId ? updatedTarget : n,
				)
				modifiedNodes.push(fallbackNode as (typeof blueprint.nodes)[number])

				const fallbackEdge = {
					source: params.nodeId,
					target: fallbackNodeId,
					condition: 'onError',
				}

				const modifiedEdges = [...blueprint.edges]
				modifiedEdges.push(fallbackEdge as (typeof blueprint.edges)[number])

				const modified: WorkflowBlueprint = {
					...blueprint,
					nodes: modifiedNodes as WorkflowBlueprint['nodes'],
					edges: modifiedEdges as WorkflowBlueprint['edges'],
				}

				return {
					status: 'completed',
					data: {
						blueprint: modified,
						fallbackNodeId,
						targetNodeId: params.nodeId,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: modified.id,
						blueprintVersion: modified.metadata?.version,
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: params.blueprint.id,
					},
				}
			}
		},
	})
}

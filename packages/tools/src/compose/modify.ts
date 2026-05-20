import { z } from 'zod'
import type { WorkflowBlueprint } from 'flowcraft'
import type { WorkflowTool } from '../types'
import { createWorkflowTool } from '../tool'
import { nodeId, edgeSource, edgeTarget } from './helpers'

const modifyBlueprintSchema = z.object({
	blueprint: z
		.object({
			id: z.string(),
			nodes: z.array(z.unknown()),
			edges: z.array(z.unknown()),
		})
		.describe('The current blueprint to modify'),
	operation: z
		.enum(['add_node', 'remove_node', 'edit_node', 'add_edge', 'remove_edge', 'edit_edge'])
		.describe('The type of modification to perform'),
	changes: z.record(z.string(), z.unknown()).describe('The changes to apply'),
})

export function createModifyBlueprintTool(): WorkflowTool<typeof modifyBlueprintSchema> {
	return createWorkflowTool({
		name: 'modify_workflow',
		description: 'Add, remove, or edit nodes and edges in an existing workflow blueprint',
		parameters: modifyBlueprintSchema,
		execute: async (params) => {
			const start = Date.now()
			try {
				const blueprint = params.blueprint as unknown as WorkflowBlueprint
				const nodes = [...blueprint.nodes] as unknown[]
				const edges = [...blueprint.edges] as unknown[]

				switch (params.operation) {
					case 'add_node':
						nodes.push(params.changes)
						break
					case 'remove_node': {
						const targetId = (params.changes as Record<string, unknown>).id as string
						const idx = nodes.findIndex((n) => nodeId(n) === targetId)
						if (idx !== -1) nodes.splice(idx, 1)
						break
					}
					case 'edit_node': {
						const targetId = (params.changes as Record<string, unknown>).id as string
						const idx = nodes.findIndex((n) => nodeId(n) === targetId)
						if (idx !== -1) {
							nodes[idx] = Object.assign({}, nodes[idx], params.changes)
						}
						break
					}
					case 'add_edge':
						edges.push(params.changes)
						break
					case 'remove_edge': {
						const source = (params.changes as Record<string, unknown>).source as string
						const target = (params.changes as Record<string, unknown>).target as string
						const eIdx = edges.findIndex(
							(e) => edgeSource(e) === source && edgeTarget(e) === target,
						)
						if (eIdx !== -1) edges.splice(eIdx, 1)
						break
					}
					case 'edit_edge': {
						const source = (params.changes as Record<string, unknown>).source as string
						const target = (params.changes as Record<string, unknown>).target as string
						const eIdx = edges.findIndex(
							(e) => edgeSource(e) === source && edgeTarget(e) === target,
						)
						if (eIdx !== -1) {
							edges[eIdx] = Object.assign({}, edges[eIdx], params.changes)
						}
						break
					}
				}

				const modified: WorkflowBlueprint = {
					...blueprint,
					nodes: nodes as WorkflowBlueprint['nodes'],
					edges: edges as WorkflowBlueprint['edges'],
				}

				return {
					status: 'completed',
					data: { blueprint: modified },
					metadata: {
						duration: Date.now() - start,
						nodesExecuted: modified.nodes.map((n) => n.id),
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
						nodesExecuted: [],
						blueprintId: params.blueprint.id,
					},
				}
			}
		},
	})
}

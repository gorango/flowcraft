import { z } from 'zod'
import type { WorkflowBlueprint } from 'flowcraft'
import type { WorkflowTool, NodeImplementationRegistry } from '../types'
import { createWorkflowTool } from '../tool'
import { isInternalNode } from '../types'

const checkImplementationsSchema = z.object({
	blueprint: z
		.object({
			id: z.string(),
			nodes: z.array(z.unknown()),
			edges: z.array(z.unknown()),
		})
		.describe('The blueprint to check'),
})

export function createCheckNodeImplementationsTool(config?: {
	registry?: NodeImplementationRegistry
}): WorkflowTool<typeof checkImplementationsSchema> {
	return createWorkflowTool({
		name: 'check_node_implementations',
		description:
			'Verify that all nodes in a workflow blueprint have registered implementations',
		parameters: checkImplementationsSchema,
		triggers: [
			'check implementations',
			'verify nodes',
			'missing implementations',
			'node coverage',
			'are nodes implemented',
		],
		execute: async (params) => {
			const start = Date.now()

			try {
				const blueprint = params.blueprint as unknown as WorkflowBlueprint
				const registry = config?.registry

				const nodeChecks = blueprint.nodes.map((n) => {
					const uses = n.uses
					const internal = isInternalNode(uses)
					let implemented: boolean | null

					if (internal) {
						implemented = true
					} else if (registry) {
						implemented = registry.has(uses)
					} else {
						implemented = null
					}

					return {
						id: n.id,
						uses,
						implemented,
						isInternal: internal,
					}
				})

				const unimplementedCount = nodeChecks.filter((n) => n.implemented === false).length
				const unknownCount = nodeChecks.filter((n) => n.implemented === null).length

				const allImplemented = registry !== undefined ? unimplementedCount === 0 : null

				return {
					status: 'completed',
					data: {
						allImplemented,
						nodes: nodeChecks,
						unimplementedCount,
						unknownCount,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
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
						blueprintId: params.blueprint.id,
					},
				}
			}
		},
	})
}

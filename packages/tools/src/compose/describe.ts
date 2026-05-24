import { z } from 'zod'
import type { WorkflowBlueprint } from 'flowcraft'
import type { WorkflowTool } from '../types'
import { createWorkflowTool } from '../tool'
import { nodeId, edgeSource, edgeTarget } from './helpers'

const describeBlueprintSchema = z.object({
	blueprint: z
		.object({
			id: z.string(),
			nodes: z.array(z.unknown()),
			edges: z.array(z.unknown()),
		})
		.describe('The blueprint to describe'),
})

export function createDescribeBlueprintTool(): WorkflowTool<typeof describeBlueprintSchema> {
	return createWorkflowTool({
		name: 'describe_workflow',
		description: 'Get a human-readable description of a workflow blueprint structure',
		parameters: describeBlueprintSchema,
		execute: async (params) => {
			const start = Date.now()
			const blueprint = params.blueprint as unknown as WorkflowBlueprint

			const nodeDescriptions = blueprint.nodes.map((node) => {
				const incoming = blueprint.edges.filter((e) => edgeTarget(e) === node.id)
				const outgoing = blueprint.edges.filter((e) => edgeSource(e) === node.id)
				return {
					id: node.id,
					uses: node.uses,
					incoming: incoming.length,
					outgoing: outgoing.length,
				}
			})

			const startNodeIds = blueprint.nodes
				.filter((n) => !blueprint.edges.some((e) => edgeTarget(e) === nodeId(n)))
				.map((n) => nodeId(n))

			const terminalNodeIds = blueprint.nodes
				.filter((n) => !blueprint.edges.some((e) => edgeSource(e) === nodeId(n)))
				.map((n) => nodeId(n))

			const description =
				`Workflow "${blueprint.id}" has ${blueprint.nodes.length} nodes and ${blueprint.edges.length} edges. ` +
				`Start nodes: ${startNodeIds.join(', ') || 'none'}. ` +
				`Terminal nodes: ${terminalNodeIds.join(', ') || 'none'}. ` +
				`Nodes: ${nodeDescriptions.map((n) => `${n.id} (${n.uses})`).join(', ')}.`

			return {
				status: 'completed',
				data: {
					description,
					summary: {
						nodeCount: blueprint.nodes.length,
						edgeCount: blueprint.edges.length,
						startNodeIds,
						terminalNodeIds,
						nodes: nodeDescriptions,
					},
				},
				metadata: {
					duration: Date.now() - start,
					affectedNodes: [],
					blueprintId: blueprint.id,
					blueprintVersion: blueprint.metadata?.version,
				},
			}
		},
	})
}

import { z } from 'zod'
import type { WorkflowBlueprint, EdgeDefinition } from 'flowcraft'
import type { WorkflowTool } from '../types'
import { createWorkflowTool } from '../tool'
import { nodeId } from './helpers'

const getBlueprintDiffSchema = z.object({
	blueprintA: z
		.object({ id: z.string(), nodes: z.array(z.unknown()), edges: z.array(z.unknown()) })
		.describe('First blueprint version'),
	blueprintB: z
		.object({ id: z.string(), nodes: z.array(z.unknown()), edges: z.array(z.unknown()) })
		.describe('Second blueprint version'),
})

function edgeKey(e: EdgeDefinition): string {
	return `${e.source}_${e.target}`
}

export function createGetBlueprintDiffTool(): WorkflowTool<typeof getBlueprintDiffSchema> {
	return createWorkflowTool({
		name: 'get_blueprint_diff',
		description:
			'Compare two workflow blueprint versions and identify all structural differences',
		parameters: getBlueprintDiffSchema,
		execute: async (params) => {
			const start = Date.now()

			try {
				const bpA = params.blueprintA as unknown as WorkflowBlueprint
				const bpB = params.blueprintB as unknown as WorkflowBlueprint

				const idsA = new Set(bpA.nodes.map((n) => nodeId(n)))
				const idsB = new Set(bpB.nodes.map((n) => nodeId(n)))

				const addedNodeIds = [...idsB].filter((id) => !idsA.has(id))
				const removedNodeIds = [...idsA].filter((id) => !idsB.has(id))
				const commonIds = [...idsA].filter((id) => idsB.has(id))

				const addedNodes = addedNodeIds.map((id) => {
					const n = bpB.nodes.find((node) => nodeId(node) === id)
					const uses = n?.uses as string | undefined
					return { id, uses: uses ?? 'unknown' }
				})

				const removedNodes = removedNodeIds.map((id) => ({ id }))

				const modifiedNodes: Array<{
					id: string
					changes: Record<string, { from: unknown; to: unknown }>
				}> = []

				for (const id of commonIds) {
					const nodeA = bpA.nodes.find((n) => nodeId(n) === id)
					const nodeB = bpB.nodes.find((n) => nodeId(n) === id)
					const changes: Record<string, { from: unknown; to: unknown }> = {}

					if (nodeA?.uses !== nodeB?.uses) {
						changes.uses = { from: nodeA?.uses, to: nodeB?.uses }
					}
					if (JSON.stringify(nodeA?.params) !== JSON.stringify(nodeB?.params)) {
						changes.params = { from: nodeA?.params, to: nodeB?.params }
					}
					if (JSON.stringify(nodeA?.config) !== JSON.stringify(nodeB?.config)) {
						changes.config = { from: nodeA?.config, to: nodeB?.config }
					}

					if (Object.keys(changes).length > 0) {
						modifiedNodes.push({ id, changes })
					}
				}

				const edgeKeysA = new Set(bpA.edges.map((e) => edgeKey(e)))
				const edgeKeysB = new Set(bpB.edges.map((e) => edgeKey(e)))

				const addedEdges: Array<{ source: string; target: string }> = []
				for (const e of bpB.edges) {
					const key = edgeKey(e)
					if (!edgeKeysA.has(key)) {
						addedEdges.push({
							source: e.source,
							target: e.target,
						})
					}
				}

				const removedEdges: Array<{ source: string; target: string }> = []
				for (const e of bpA.edges) {
					const key = edgeKey(e)
					if (!edgeKeysB.has(key)) {
						removedEdges.push({
							source: e.source,
							target: e.target,
						})
					}
				}

				const hasChanges =
					addedNodes.length > 0 ||
					removedNodes.length > 0 ||
					modifiedNodes.length > 0 ||
					addedEdges.length > 0 ||
					removedEdges.length > 0

				const parts: string[] = []
				if (addedNodes.length > 0) parts.push(`${addedNodes.length} node(s) added`)
				if (removedNodes.length > 0) parts.push(`${removedNodes.length} node(s) removed`)
				if (modifiedNodes.length > 0) parts.push(`${modifiedNodes.length} node(s) modified`)
				if (addedEdges.length > 0) parts.push(`${addedEdges.length} edge(s) added`)
				if (removedEdges.length > 0) parts.push(`${removedEdges.length} edge(s) removed`)
				const summary = hasChanges ? parts.join(', ') : 'No changes'

				return {
					status: 'completed',
					data: {
						hasChanges,
						addedNodes,
						removedNodes,
						modifiedNodes,
						addedEdges,
						removedEdges,
						summary,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: bpB.id,
						blueprintVersion: bpB.metadata?.version,
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: params.blueprintB.id,
					},
				}
			}
		},
	})
}

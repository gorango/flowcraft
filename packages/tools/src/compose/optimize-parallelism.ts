import { z } from 'zod'
import type { WorkflowBlueprint } from 'flowcraft'
import type { WorkflowTool } from '../types'
import { createWorkflowTool } from '../tool'
import { getExecutionOrder, findOrphanNodes } from '../utils/graph'
import { nodeId } from './helpers'

const optimizeForParallelismSchema = z.object({
	blueprint: z
		.object({ id: z.string(), nodes: z.array(z.unknown()), edges: z.array(z.unknown()) })
		.describe('The blueprint to analyze'),
})

export function createOptimizeForParallelismTool(): WorkflowTool<
	typeof optimizeForParallelismSchema
> {
	return createWorkflowTool({
		name: 'optimize_for_parallelism',
		description:
			'Analyze a blueprint for parallelism opportunities and suggest structural improvements',
		parameters: optimizeForParallelismSchema,
		execute: async (params) => {
			const start = Date.now()

			try {
				const blueprint = params.blueprint as unknown as WorkflowBlueprint
				const order = getExecutionOrder(blueprint)
				const orphans = findOrphanNodes(blueprint)

				const adjList = new Map<string, Set<string>>()
				for (const node of blueprint.nodes) {
					adjList.set(nodeId(node), new Set())
				}
				for (const edge of blueprint.edges) {
					const e = edge as unknown as Record<string, unknown>
					const source = e.source as string
					const target = e.target as string
					adjList.get(target)?.add(source)
				}

				const levels: Array<string[]> = []
				const completed = new Set<string>()
				while (completed.size < blueprint.nodes.length) {
					const ready: string[] = []
					for (const id of order) {
						if (completed.has(id)) continue
						const preds = adjList.get(id) ?? new Set()
						if ([...preds].every((p) => completed.has(p))) {
							ready.push(id)
						}
					}
					if (ready.length === 0) {
						const remaining = order.filter((n) => !completed.has(n))
						if (remaining.length > 0) {
							ready.push(remaining[0])
						} else {
							break
						}
					}
					for (const id of ready) {
						completed.add(id)
					}
					levels.push(ready)
				}

				const maxParallelism = Math.max(...levels.map((l) => l.length))
				const avgParallelism =
					levels.reduce((sum, l) => sum + l.length, 0) / (levels.length || 1)
				const fanOutNodes: Array<{
					nodeId: string
					branchCount: number
				}> = []

				for (const id of order) {
					const successors = blueprint.edges
						.filter((e) => (e as unknown as Record<string, unknown>).source === id)
						.map((e) => (e as unknown as Record<string, unknown>).target as string)
					if (successors.length > 1) {
						fanOutNodes.push({ nodeId: id, branchCount: successors.length })
					}
				}

				const suggestions: string[] = []
				if (fanOutNodes.length > 0) {
					suggestions.push(
						`Fan-out nodes detected (${fanOutNodes.length} nodes branching to multiple successors). These are already leveraging parallelism.`,
					)
				}
				if (maxParallelism < 2 && blueprint.nodes.length > 2) {
					suggestions.push(
						'This workflow is entirely sequential. Identify independent steps that can run in parallel.',
					)
				}
				if (orphans.length > 0) {
					suggestions.push(
						`Orphan nodes detected: ${orphans.join(', ')}. These will never execute.`,
					)
				}
				if (levels.length > blueprint.nodes.length * 0.5) {
					suggestions.push(
						'Workflow has many execution levels relative to node count. Review edge structure for unnecessary dependencies.',
					)
				}

				return {
					status: 'completed',
					data: {
						executionLevels: levels.map((l, i) => ({ level: i, nodes: l })),
						totalLevels: levels.length,
						maxParallelism,
						avgParallelism: Math.round(avgParallelism * 100) / 100,
						suggestions,
						orphans,
						fanOutNodes,
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

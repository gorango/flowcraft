import { z } from 'zod'
import type { WorkflowBlueprint } from 'flowcraft'
import type { WorkflowTool } from '../types'
import { createWorkflowTool } from '../tool'
import { getExecutionOrder, getSuccessors } from '../utils/graph'

const simulateExecutionSchema = z.object({
	blueprint: z
		.object({ id: z.string(), nodes: z.array(z.unknown()), edges: z.array(z.unknown()) })
		.describe('The blueprint to simulate'),
	sampleData: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('Mock node outputs for edge condition evaluation'),
})

export function createSimulateExecutionTool(): WorkflowTool<typeof simulateExecutionSchema> {
	return createWorkflowTool({
		name: 'simulate_execution',
		description:
			'Perform a dry-run simulation of workflow execution to predict execution path and branching decisions',
		parameters: simulateExecutionSchema,
		execute: async (params) => {
			const start = Date.now()

			try {
				const blueprint = params.blueprint as unknown as WorkflowBlueprint

				const order = getExecutionOrder(blueprint)
				const branchingDecisions: Array<{
					fromNode: string
					chosenPath: string
					alternatives: string[]
				}> = []
				const nodesThatWillExecute = new Set<string>()
				const nodesThatWillBeSkipped = new Set<string>()

				for (const nid of order) {
					const predecessorEdges = blueprint.edges.filter((e) => e.target === nid)

					const node = blueprint.nodes.find((n) => n.id === nid)
					const nodeConfig = node?.config as Record<string, unknown> | undefined
					const joinStrategy = nodeConfig?.joinStrategy ?? 'all'

					const allPredecessorsExecuted = predecessorEdges.every((e) => {
						return nodesThatWillExecute.has(e.source)
					})

					const anyPredecessorExecuted = predecessorEdges.some((e) => {
						return nodesThatWillExecute.has(e.source)
					})

					const shouldExecute =
						joinStrategy === 'any'
							? anyPredecessorExecuted || predecessorEdges.length === 0
							: allPredecessorsExecuted || predecessorEdges.length === 0

					if (predecessorEdges.length > 0 && !shouldExecute) {
						nodesThatWillBeSkipped.add(nid)
						continue
					}

					nodesThatWillExecute.add(nid)

					const successors = getSuccessors(blueprint, nid)
					const actionEdges = successors.filter((s) => s.edge.action)
					if (actionEdges.length > 0) {
						const sampleOutput = params.sampleData?.[nid]
						branchingDecisions.push({
							fromNode: nid,
							chosenPath: sampleOutput ? String(sampleOutput) : actionEdges[0].nodeId,
							alternatives: actionEdges.map((s) => s.nodeId),
						})
					}
				}

				return {
					status: 'completed',
					data: {
						executionPath: order,
						branchingDecisions,
						estimatedDuration: order.length * 100,
						nodesThatWillExecute: Array.from(nodesThatWillExecute),
						nodesThatWillBeSkipped: Array.from(nodesThatWillBeSkipped),
						nodeCount: blueprint.nodes.length,
						edgeCount: blueprint.edges.length,
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

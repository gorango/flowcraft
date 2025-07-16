import type { AbstractNode, Flow } from 'workflow'
import type { WorkflowRegistry } from './registry'
import type { WorkflowGraph } from './types'
import { DEFAULT_ACTION, Flow as WorkflowFlow } from 'workflow'
import { ParallelNode } from './nodes'
import { nodeRegistry } from './registry'

export class FlowBuilder {
	constructor(private registry: WorkflowRegistry) { }

	/**
	 * Wires the successors for a node that represents a parallel execution block.
	 * It determines the "fan-in" or convergence point(s) for the parallel branches.
	 */
	private wireSuccessors(
		sourceNode: AbstractNode,
		targetNodeIds: string[],
		edgeGroups: Map<string, Map<string, string[]>>,
		nodeMap: Map<string, AbstractNode>,
	): void {
		const convergenceGroups = new Map<string, string[]>() // Map<action, uniqueTargetId[]>

		// Find all unique successors for the nodes that just ran in parallel.
		for (const targetNodeId of targetNodeIds) {
			const successorActions = edgeGroups.get(targetNodeId)
			if (successorActions) {
				for (const [action, successorIds] of successorActions.entries()) {
					if (!convergenceGroups.has(action))
						convergenceGroups.set(action, [])

					const uniqueSuccessorIds = convergenceGroups.get(action)!
					for (const successorId of successorIds) {
						if (!uniqueSuccessorIds.includes(successorId))
							uniqueSuccessorIds.push(successorId)
					}
				}
			}
		}

		for (const [action, successorIds] of convergenceGroups.entries()) {
			const successorNodes = successorIds.map(id => nodeMap.get(id)!)

			if (successorNodes.length === 1) {
				sourceNode.next(successorNodes[0], action)
			}
			else if (successorNodes.length > 1) {
				const parallelConvergenceNode = new ParallelNode(successorNodes)
				sourceNode.next(parallelConvergenceNode, action)
				this.wireSuccessors(parallelConvergenceNode, successorIds, edgeGroups, nodeMap)
			}
		}
	}

	build(graph: WorkflowGraph): Flow {
		const nodeMap = new Map<string, AbstractNode>()

		for (const uiNode of graph.nodes) {
			const NodeClass = nodeRegistry.get(uiNode.type)
			if (!NodeClass)
				throw new Error(`Unsupported node type: ${uiNode.type}`)

			const executableNode = new NodeClass({
				data: { ...uiNode.data, nodeId: uiNode.id },
				registry: this.registry,
			})
			nodeMap.set(uiNode.id, executableNode)
		}

		const edgeGroups = new Map<string, Map<string, string[]>>()
		for (const edge of graph.edges) {
			if (!edgeGroups.has(edge.source))
				edgeGroups.set(edge.source, new Map<string, string[]>())

			const sourceActions = edgeGroups.get(edge.source)!
			const action = edge.action || DEFAULT_ACTION

			if (!sourceActions.has(action))
				sourceActions.set(action, [])

			sourceActions.get(action)!.push(edge.target)
		}

		for (const [sourceId, actions] of edgeGroups.entries()) {
			const sourceNode = nodeMap.get(sourceId)!
			for (const [action, targetIds] of actions.entries()) {
				const targetNodes = targetIds.map(id => nodeMap.get(id)!)

				if (targetNodes.length === 1) {
					sourceNode.next(targetNodes[0], action)
				}
				else if (targetNodes.length > 1) {
					console.log(`[Builder] Detected parallel fan-out from '${sourceId}' on action '${action}' to ${targetIds.length} nodes.`)
					const parallelFanOutNode = new ParallelNode(targetNodes)
					sourceNode.next(parallelFanOutNode, action)
					this.wireSuccessors(parallelFanOutNode, targetIds, edgeGroups, nodeMap)
				}
			}
		}

		// Identify start nodes (no incoming edges)
		const targetIds = new Set(graph.edges.map(e => e.target))
		const startNodeIds = graph.nodes.filter(n => !targetIds.has(n.id)).map(n => n.id)

		if (startNodeIds.length === 0 && graph.nodes.length > 0)
			throw new Error('Flow has no start node (a node with no incoming edges).')

		if (startNodeIds.length === 1) {
			const startNode = nodeMap.get(startNodeIds[0])!
			return new WorkflowFlow(startNode)
		}

		// Wrap multiple start nodes in a single parallel entry point
		const startNodes = startNodeIds.map(id => nodeMap.get(id)!)
		const parallelStartNode = new ParallelNode(startNodes)
		this.wireSuccessors(parallelStartNode, startNodeIds, edgeGroups, nodeMap)

		return new WorkflowFlow(parallelStartNode)
	}
}

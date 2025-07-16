import type { AbstractNode } from '../workflow'
import { DEFAULT_ACTION, Flow } from '../workflow'

/**
 * Represents a node within a declarative workflow graph.
 */
export interface GraphNode {
	/** A unique identifier for the node within the graph. */
	id: string
	/** The type of the node, used to look up the corresponding Node class in the registry. */
	type: string
	/** A flexible data object passed as options to the node's constructor. */
	data?: Record<string, any>
}

/**
 * Represents a directed edge connecting two nodes in a workflow graph.
 */
export interface GraphEdge {
	/** The ID of the source node. */
	source: string
	/** The ID of the target node. */
	target: string
	/** The action from the source node that triggers this edge. Defaults to `DEFAULT_ACTION`. */
	action?: string
}

/**
 * Defines the structure of a declarative workflow graph.
 */
export interface WorkflowGraph {
	nodes: GraphNode[]
	edges: GraphEdge[]
}

/**
 * A map from a string identifier to a Node constructor.
 * Used by GraphBuilder to instantiate nodes from a graph definition.
 */
export type NodeRegistry = Map<string, new (...args: any[]) => AbstractNode>

/**
 * A special node created by the GraphBuilder to execute multiple nodes in parallel.
 * This is used for graph fan-in and fan-out operations.
 */
class ParallelNode extends Flow {
	constructor(private nodesToRun: AbstractNode[]) {
		super()
	}

	async exec({ ctx, params, signal, logger }: any) {
		logger.info(`[ParallelNode] Executing ${this.nodesToRun.length} branches in parallel...`)
		const promises = this.nodesToRun.map(node =>
			node._run(ctx, { ...params, ...node.params }, signal, logger),
		)
		await Promise.allSettled(promises)
		logger.info(`[ParallelNode] ✓ All parallel branches finished.`)
	}

	async post() {
		return DEFAULT_ACTION
	}
}

/**
 * Constructs an executable `Flow` from a declarative `WorkflowGraph` definition.
 * This allows you to define complex workflows in a format like JSON and then
 * build them into runnable objects.
 */
export class GraphBuilder {
	/**
	 * @param nodeRegistry A map where keys are node `type` strings from the graph
	 * definition and values are the corresponding `Node` class constructors.
	 * @param nodeOptionsContext An optional object that is passed to every node's
	 * constructor, useful for dependency injection.
	 */
	constructor(
		private nodeRegistry: NodeRegistry,
		private nodeOptionsContext: Record<string, any> = {},
	) { }

	private wireSuccessors(
		sourceNode: AbstractNode,
		targetNodeIds: string[],
		edgeGroups: Map<string, Map<string | typeof DEFAULT_ACTION, string[]>>,
		nodeMap: Map<string, AbstractNode>,
	): void {
		const convergenceGroups = new Map<string | typeof DEFAULT_ACTION, string[]>()

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
			const successorNodes = successorIds.map(id => nodeMap.get(id)!).filter(Boolean)
			if (successorNodes.length === 0)
				continue

			if (successorNodes.length === 1) {
				sourceNode.next(successorNodes[0], action)
			}
			else {
				const parallelConvergenceNode = new ParallelNode(successorNodes)
				sourceNode.next(parallelConvergenceNode, action)
				this.wireSuccessors(parallelConvergenceNode, successorIds, edgeGroups, nodeMap)
			}
		}
	}

	/**
	 * Builds a runnable `Flow` from a graph definition.
	 * @param graph The `WorkflowGraph` object describing the flow.
	 * @returns An executable `Flow` instance.
	 */
	build(graph: WorkflowGraph): Flow {
		const nodeMap = new Map<string, AbstractNode>()

		for (const graphNode of graph.nodes) {
			const NodeClass = this.nodeRegistry.get(graphNode.type)
			if (!NodeClass)
				throw new Error(`GraphBuilder: Node type '${graphNode.type}' not found in the registry.`)

			const nodeOptions = {
				...this.nodeOptionsContext,
				data: { ...graphNode.data, nodeId: graphNode.id },
			}
			const executableNode = new NodeClass(nodeOptions)
			nodeMap.set(graphNode.id, executableNode)
		}

		const edgeGroups = new Map<string, Map<string | typeof DEFAULT_ACTION, string[]>>()
		for (const edge of graph.edges) {
			if (!edgeGroups.has(edge.source))
				edgeGroups.set(edge.source, new Map())

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
					const parallelFanOutNode = new ParallelNode(targetNodes)
					sourceNode.next(parallelFanOutNode, action)
					this.wireSuccessors(parallelFanOutNode, targetIds, edgeGroups, nodeMap)
				}
			}
		}

		const allTargetIds = new Set(graph.edges.map(e => e.target))
		const startNodeIds = graph.nodes
			.map(n => n.id)
			.filter(id => !allTargetIds.has(id))

		if (startNodeIds.length === 0 && graph.nodes.length > 0)
			throw new Error('GraphBuilder: This graph has a cycle and no clear start node.')

		if (startNodeIds.length === 1) {
			const startNode = nodeMap.get(startNodeIds[0])!
			return new Flow(startNode)
		}

		const startNodes = startNodeIds.map(id => nodeMap.get(id)!)
		const parallelStartNode = new ParallelNode(startNodes)
		this.wireSuccessors(parallelStartNode, startNodeIds, edgeGroups, nodeMap)

		return new Flow(parallelStartNode)
	}
}

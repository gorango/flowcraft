import type { AbstractNode } from '../workflow'
import { DEFAULT_ACTION, Flow } from '../workflow'
import { ParallelFlow } from './collection'

/**
 * The standard options object passed to a Node's constructor by the `GraphBuilder`.
 * @template T The type of the `data` payload for this specific node.
 */
export interface NodeConstructorOptions<T> {
	/** The `data` payload from the graph definition, with `nodeId` injected for logging/debugging. */
	data: T & { nodeId: string }
	/** A context object containing any dependencies injected into the `GraphBuilder` constructor. */
	[key: string]: any
}

/**
 * Represents a single, type-safe node within a declarative workflow graph.
 * This is a discriminated union based on the `type` property, ensuring that
 * the `data` payload matches the node's type as defined in the `TypedNodeRegistry`.
 * @template T The `NodeTypeMap` that defines all possible node types and their data schemas.
 */
export type TypedGraphNode<T extends { [K in keyof T]: Record<string, any> }> = {
	[K in keyof T]: {
		/** A unique identifier for the node within the graph. */
		id: string
		/** The type of the node, used to look up the corresponding Node class in the registry. */
		type: K
		/** A flexible data object that must match the schema defined in the `NodeTypeMap` for this type. */
		data: T[K]
	}
}[keyof T]

/**
 * Represents a directed edge connecting two nodes in a workflow graph.
 */
export interface GraphEdge {
	/** The `id` of the source node. */
	source: string
	/** The `id` of the target node. */
	target: string
	/** The action from the source node that triggers this edge. Defaults to `DEFAULT_ACTION`. */
	action?: string
}

/**
 * Defines the structure of a type-safe, declarative workflow graph.
 * @template T The `NodeTypeMap` that validates the graph's node definitions.
 */
export interface TypedWorkflowGraph<T extends { [K in keyof T]: Record<string, any> }> {
	/** An array of node definitions. */
	nodes: TypedGraphNode<T>[]
	/** An array of edge definitions that connect the nodes. */
	edges: GraphEdge[]
}

/**
 * A type-safe registry that maps a node type string to its corresponding `Node` constructor.
 * TypeScript ensures that the constructor's options match the schema defined in the `NodeTypeMap`.
 * @template T The `NodeTypeMap` that defines all possible node types and their data schemas.
 */
export type TypedNodeRegistry<T extends { [K in keyof T]: Record<string, any> }> = {
	[K in keyof T]: new (options: NodeConstructorOptions<T[K]>) => AbstractNode
}

/**
 * A type-safe helper function for creating a `TypedNodeRegistry`.
 * This function preserves the strong typing of the registry object, enabling
 * compile-time validation of `TypedWorkflowGraph` definitions.
 *
 * @param registry The registry object, where keys are node types and values are `Node` constructors.
 * @returns The same registry object, correctly typed for use with `GraphBuilder`.
 */
export function createNodeRegistry<T extends { [K in keyof T]: Record<string, any> }>(registry: TypedNodeRegistry<T>): TypedNodeRegistry<T> {
	return registry
}

/**
 * The result of a successful `GraphBuilder.build()` call.
 */
export interface BuildResult {
	/** The fully wired, executable `Flow` instance. */
	flow: Flow
	/** A map of all created node instances, keyed by their `id` from the graph definition. */
	nodeMap: Map<string, AbstractNode>
	/** A map of all node `id`s to their predecessor count. */
	predecessorCountMap: Map<string, number>
}

/**
 * Represents a node within the workflow graph.
 * This is a simpler (UNTYPED) version of the `TypedGraphNode` type
 */
export interface GraphNode {
	id: string
	type: string
	data?: Record<string, any>
}

/**
 * Defines the structure of a workflow graph.
 * This is a simpler (UNTYPED) version of the `TypedWorkflowGraph` type
 */
export interface WorkflowGraph {
	nodes: GraphNode[]
	edges: GraphEdge[]
}

/**
 * A permissive (UNTYPED) registry that maps a node type string to a constructor.
 * This is a simpler (UNTYPED) version of the `TypedNodeRegistry` type
 */
export type NodeRegistry = Map<string, new (...args: any[]) => AbstractNode>

/**
 * Constructs an executable `Flow` from a declarative `WorkflowGraph` definition.
 * It supports a fully type-safe API for compile-time validation of graph definitions
 * and intelligently handles complex patterns like parallel fan-out and fan-in.
 * @template T A `NodeTypeMap` for validating type-safe graph definitions.
 */
export class GraphBuilder<T extends { [K in keyof T]: Record<string, any> }> {
	private registry: Map<string, new (...args: any[]) => AbstractNode>

	/**
	 * @param registry A type-safe object or a `Map` where keys are node `type` strings and
	 * values are the corresponding `Node` class constructors. For type-safety, use `createNodeRegistry`.
	 * @param nodeOptionsContext An optional object that is passed to every node's
	 * constructor, useful for dependency injection (e.g., passing a database client or the builder itself).
	 */
	// type-safe overload
	constructor(registry: TypedNodeRegistry<T>, nodeOptionsContext?: Record<string, any>)
	// untyped overload
	constructor(registry: NodeRegistry, nodeOptionsContext?: Record<string, any>)
	// handle both cases
	constructor(
		registry: TypedNodeRegistry<T> | NodeRegistry,
		private nodeOptionsContext: Record<string, any> = {},
	) {
		if (registry instanceof Map) {
			this.registry = registry
		}
		else {
			this.registry = new Map(Object.entries(registry))
		}
	}

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
				const parallelConvergenceNode = new ParallelFlow(successorNodes)
				sourceNode.next(parallelConvergenceNode, action)
				this.wireSuccessors(parallelConvergenceNode, successorIds, edgeGroups, nodeMap)
			}
		}
	}

	/**
	 * Builds a runnable `Flow` from a graph definition.
	 * @param graph The `WorkflowGraph` object describing the flow.
	 * @returns A `BuildResult` object containing the executable `flow` and a `nodeMap`.
	 */
	// type-safe overload
	build(graph: TypedWorkflowGraph<T>): BuildResult
	// untyped overload
	build(graph: WorkflowGraph): BuildResult
	// single implementation that handles both cases
	build(graph: TypedWorkflowGraph<T> | WorkflowGraph): BuildResult {
		const nodeMap = new Map<string, AbstractNode>()

		const predecessorMap = new Map<string, Set<string>>()
		for (const edge of graph.edges) {
			if (!predecessorMap.has(edge.target))
				predecessorMap.set(edge.target, new Set())

			predecessorMap.get(edge.target)!.add(edge.source)
		}
		const predecessorCountMap = new Map<string, number>()
		for (const node of graph.nodes) {
			const uniquePredecessors = predecessorMap.get(node.id)
			predecessorCountMap.set(node.id, uniquePredecessors ? uniquePredecessors.size : 0)
		}

		for (const graphNode of graph.nodes) {
			const NodeClass = this.registry.get(graphNode.type.toString())
			if (!NodeClass)
				throw new Error(`GraphBuilder: Node type '${graphNode.type.toString()}' not found in the registry.`)

			const nodeOptions = {
				...this.nodeOptionsContext,
				data: { ...graphNode.data, nodeId: graphNode.id },
			}
			const executableNode = new NodeClass(nodeOptions).withId(graphNode.id)
			nodeMap.set(graphNode.id, executableNode)
		}

		const allNodeIds = Array.from(nodeMap.keys())
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
					const parallelFanOutNode = new ParallelFlow(targetNodes)
					sourceNode.next(parallelFanOutNode, action)
					this.wireSuccessors(parallelFanOutNode, targetIds, edgeGroups, nodeMap)
				}
			}
		}

		const allTargetIds = new Set(graph.edges.map(e => e.target))
		const startNodeIds = allNodeIds.filter(id => !allTargetIds.has(id))

		if (startNodeIds.length === 0 && allNodeIds.length > 0)
			throw new Error('GraphBuilder: This graph has a cycle and no clear start node.')

		if (startNodeIds.length === 1) {
			const startNode = nodeMap.get(startNodeIds[0])!
			return { flow: new Flow(startNode), nodeMap, predecessorCountMap }
		}

		const startNodes = startNodeIds.map(id => nodeMap.get(id)!)
		const parallelStartNode = new ParallelFlow(startNodes)
		this.wireSuccessors(parallelStartNode, startNodeIds, edgeGroups, nodeMap)

		return { flow: new Flow(parallelStartNode), nodeMap, predecessorCountMap }
	}
}

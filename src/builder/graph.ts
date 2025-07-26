import type { AbstractNode, FILTER_FAILED, NodeArgs, NodeOptions } from '../workflow'
import { DEFAULT_ACTION, Flow, Node } from '../workflow'
import { ParallelFlow } from './collection'

/**
 * The standard options object passed to a Node's constructor by the `GraphBuilder`.
 * @template T The type of the `data` payload for this specific node.
 */
export interface NodeConstructorOptions<T> extends NodeOptions {
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
 * An internal node used by the GraphBuilder to handle the `inputs` mapping
 * of an inlined sub-workflow. It copies data from the parent context scope
 * to the sub-workflow's context scope.
 * @internal
 */
class InputMappingNode extends Node {
	private mappings: Record<string, string>
	constructor(options: { data: Record<string, string> }) {
		super()
		const { nodeId, ...mappings } = options.data
		this.mappings = mappings
	}

	async prep({ ctx, logger }: NodeArgs) {
		for (const [subKey, parentKey] of Object.entries(this.mappings)) {
			if (ctx.has(parentKey)) {
				ctx.set(subKey, ctx.get(parentKey))
			}
			else {
				logger.warn(`[InputMapper] Input mapping failed. Key '${parentKey}' not found in context.`)
			}
		}
	}
}

/**
 * An internal node used by the GraphBuilder to handle the `outputs` mapping
 * of an inlined sub-workflow. It copies data from the sub-workflow's
 * context scope back to the parent's context scope.
 * @internal
 */
class OutputMappingNode extends Node {
	private mappings: Record<string, string>
	constructor(options: { data: Record<string, string> }) {
		super()
		const { nodeId, ...mappings } = options.data
		this.mappings = mappings
	}

	async prep({ ctx, logger }: NodeArgs) {
		for (const [parentKey, subKey] of Object.entries(this.mappings)) {
			if (ctx.has(subKey)) {
				ctx.set(parentKey, ctx.get(subKey))
			}
			else {
				logger.warn(`[OutputMapper] Output mapping failed. Key '${subKey}' not found in context.`)
			}
		}
	}
}

interface GraphBuilderOptions {
	subWorkflowNodeTypes?: string[]
}

/**
 * Constructs an executable `Flow` from a declarative `WorkflowGraph` definition.
 * It supports a fully type-safe API for compile-time validation of graph definitions
 * and intelligently handles complex patterns like parallel fan-out and fan-in.
 * @template T A `NodeTypeMap` for validating type-safe graph definitions.
 */
export class GraphBuilder<T extends { [K in keyof T]: Record<string, any> }> {
	private registry: Map<string, new (...args: any[]) => AbstractNode>
	private subWorkflowNodeTypes: string[]

	/**
	 * @param registry A type-safe object or a `Map` where keys are node `type` strings and
	 * values are the corresponding `Node` class constructors. For type-safety, use `createNodeRegistry`.
	 * @param nodeOptionsContext An optional object that is passed to every node's
	 * constructor, useful for dependency injection (e.g., passing a database client or the builder itself).
	 */
	// type-safe overload
	constructor(registry: TypedNodeRegistry<T>, nodeOptionsContext?: Record<string, any>, options?: GraphBuilderOptions)
	// untyped overload
	constructor(registry: NodeRegistry, nodeOptionsContext?: Record<string, any>, options?: GraphBuilderOptions)
	// handle both cases
	constructor(
		registry: TypedNodeRegistry<T> | NodeRegistry,
		private nodeOptionsContext: Record<string, any> = {},
		options: GraphBuilderOptions = {},
	) {
		if (registry instanceof Map) {
			this.registry = registry
		}
		else {
			this.registry = new Map(Object.entries(registry))
		}
		this.registry.set('__internal_input_mapper__', InputMappingNode as any)
		this.registry.set('__internal_output_mapper__', OutputMappingNode as any)
		this.subWorkflowNodeTypes = options.subWorkflowNodeTypes ?? []
	}

	private _flattenGraph(graph: WorkflowGraph, idPrefix = ''): WorkflowGraph {
		const finalNodes: GraphNode[] = []
		const finalEdges: GraphEdge[] = []

		const localNodeIds = new Set(graph.nodes.map(n => n.id))

		// Pass 1: Recursively add all nodes, inlining sub-workflows and rewriting input paths.
		for (const node of graph.nodes) {
			const prefixedNodeId = `${idPrefix}${node.id}`
			const isRegisteredSubWorkflow = this.subWorkflowNodeTypes.includes(node.type)
			const hasWorkflowId = node.data && 'workflowId' in node.data

			// Create a mutable copy of node data to safely rewrite input paths.
			const newNodeData = JSON.parse(JSON.stringify(node.data || {}))

			if (newNodeData.inputs) {
				const inputs = newNodeData.inputs as Record<string, string | string[]>
				for (const [templateKey, sourcePathOrPaths] of Object.entries(inputs)) {
					const sourcePaths = Array.isArray(sourcePathOrPaths) ? sourcePathOrPaths : [sourcePathOrPaths]
					const newSourcePaths = sourcePaths.map((sourcePath) => {
						// If the input source is another node within this same graph file, prefix its ID.
						// Otherwise, leave it as is (it's from a parent context or an initial value).
						if (localNodeIds.has(sourcePath))
							return `${idPrefix}${sourcePath}`

						return sourcePath
					})
					inputs[templateKey] = Array.isArray(sourcePathOrPaths) ? newSourcePaths : newSourcePaths[0]
				}
			}

			if (isRegisteredSubWorkflow) {
				const subWorkflowData = node.data as any
				const subWorkflowId = subWorkflowData.workflowId
				const registry = this.nodeOptionsContext.registry as any
				if (!registry || typeof registry.getGraph !== 'function')
					throw new Error('GraphBuilder needs a registry with a `getGraph` method in its context to resolve sub-workflows.')

				const subGraph: WorkflowGraph | undefined = registry.getGraph(subWorkflowId)
				if (!subGraph)
					throw new Error(`Sub-workflow with ID ${subWorkflowId} not found in registry.`)

				const inputMapperId = `${prefixedNodeId}_input_mapper`
				const outputMapperId = `${prefixedNodeId}_output_mapper`
				finalNodes.push({ id: inputMapperId, type: '__internal_input_mapper__', data: subWorkflowData.inputs || {} })
				finalNodes.push({ id: outputMapperId, type: '__internal_output_mapper__', data: subWorkflowData.outputs || {} })

				const inlinedSubGraph = this._flattenGraph(subGraph, `${prefixedNodeId}:`)
				finalNodes.push(...inlinedSubGraph.nodes)
				finalEdges.push(...inlinedSubGraph.edges)

				const subGraphStartIds = inlinedSubGraph.nodes.map(n => n.id).filter(id => !inlinedSubGraph.edges.some(e => e.target === id))
				for (const startId of subGraphStartIds)
					finalEdges.push({ source: inputMapperId, target: startId, action: DEFAULT_ACTION as any })

				const subGraphTerminalIds = inlinedSubGraph.nodes.map(n => n.id).filter(id => !inlinedSubGraph.edges.some(e => e.source === id))
				for (const terminalId of subGraphTerminalIds)
					finalEdges.push({ source: terminalId, target: outputMapperId, action: DEFAULT_ACTION as any })
			}
			else if (hasWorkflowId) {
				throw new Error(
					`GraphBuilder Error: Node with ID '${node.id}' and type '${node.type}' contains a 'workflowId' property, `
					+ `but its type is not registered in the 'subWorkflowNodeTypes' option. `
					+ `Please add '${node.type}' to the subWorkflowNodeTypes array in the GraphBuilder constructor.`,
				)
			}
			else {
				// Add the normal node with its newly resolved input paths.
				finalNodes.push({ ...node, id: prefixedNodeId, data: newNodeData })
			}
		}

		// Pass 2: Re-wire all original edges to connect to the correct nodes in the flattened graph.
		for (const edge of graph.edges) {
			const sourceNode = graph.nodes.find(n => n.id === edge.source)!
			const targetNode = graph.nodes.find(n => n.id === edge.target)!
			const prefixedSourceId = `${idPrefix}${edge.source}`
			const prefixedTargetId = `${idPrefix}${edge.target}`

			const isSourceSub = this.subWorkflowNodeTypes.includes(sourceNode.type)
			const isTargetSub = this.subWorkflowNodeTypes.includes(targetNode.type)

			if (isSourceSub && isTargetSub)
				finalEdges.push({ ...edge, source: `${prefixedSourceId}_output_mapper`, target: `${prefixedTargetId}_input_mapper` })
			else if (isSourceSub)
				finalEdges.push({ ...edge, source: `${prefixedSourceId}_output_mapper`, target: prefixedTargetId })
			else if (isTargetSub)
				finalEdges.push({ ...edge, source: prefixedSourceId, target: `${prefixedTargetId}_input_mapper` })
			else
				finalEdges.push({ ...edge, source: prefixedSourceId, target: prefixedTargetId })
		}
		return { nodes: finalNodes, edges: finalEdges }
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
		const flatGraph = this._flattenGraph(graph as WorkflowGraph)

		const nodeMap = new Map<string, AbstractNode>()
		const predecessorMap = new Map<string, Set<string>>()
		for (const edge of flatGraph.edges) {
			if (!predecessorMap.has(edge.target))
				predecessorMap.set(edge.target, new Set())
			predecessorMap.get(edge.target)!.add(edge.source)
		}
		const predecessorCountMap = new Map<string, number>()
		for (const node of flatGraph.nodes) {
			const uniquePredecessors = predecessorMap.get(node.id)
			predecessorCountMap.set(node.id, uniquePredecessors ? uniquePredecessors.size : 0)
		}

		// Pass 1: Instantiate all nodes.
		for (const graphNode of flatGraph.nodes) {
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

		// Pass 2: Group all edges by their source and action. This map is the source of truth for wiring.
		const edgeGroups = new Map<string, Map<string | typeof DEFAULT_ACTION | typeof FILTER_FAILED, AbstractNode[]>>()
		for (const edge of flatGraph.edges) {
			const sourceId = edge.source
			const action = edge.action || DEFAULT_ACTION
			const targetNode = nodeMap.get(edge.target)!

			if (!edgeGroups.has(sourceId))
				edgeGroups.set(sourceId, new Map())
			const sourceActions = edgeGroups.get(sourceId)!
			if (!sourceActions.has(action))
				sourceActions.set(action, [])
			sourceActions.get(action)!.push(targetNode)
		}

		// Pass 3: Wire the graph using the grouped edges, creating ParallelFlows where necessary.
		for (const [sourceId, actions] of edgeGroups.entries()) {
			const sourceNode = nodeMap.get(sourceId)!
			for (const [action, successors] of actions.entries()) {
				if (successors.length === 1) {
					// Simple 1-to-1 connection.
					sourceNode.next(successors[0], action)
				}
				else if (successors.length > 1) {
					// Fan-out detected. Create a container.
					const parallelNode = new ParallelFlow(successors)
					sourceNode.next(parallelNode, action)

					// Determine the single convergence point for this parallel block.
					const firstBranchSuccessor = edgeGroups.get(successors[0].id!.toString())?.get(DEFAULT_ACTION)?.[0]
					if (firstBranchSuccessor) {
						const allConverge = successors.slice(1).every(
							node => edgeGroups.get(node.id!.toString())?.get(DEFAULT_ACTION)?.[0] === firstBranchSuccessor,
						)
						// If all branches lead to the same next node, wire the container to it.
						if (allConverge)
							parallelNode.next(firstBranchSuccessor)
					}
				}
			}
		}

		// Final Step: Determine the start node(s) for the entire flow.
		const allNodeIds = Array.from(nodeMap.keys())
		const allTargetIds = new Set(flatGraph.edges.map(e => e.target))
		const startNodeIds = allNodeIds.filter(id => !allTargetIds.has(id))

		if (startNodeIds.length === 0 && allNodeIds.length > 0)
			throw new Error('GraphBuilder: This graph has a cycle and no clear start node.')

		if (startNodeIds.length === 1) {
			const startNode = nodeMap.get(startNodeIds[0])!
			const flow = new Flow(startNode)
			return { flow, nodeMap, predecessorCountMap }
		}

		// Handle parallel start nodes.
		const startNodes = startNodeIds.map(id => nodeMap.get(id)!)
		const parallelStartNode = new ParallelFlow(startNodes)

		if (startNodes.length > 0) {
			const firstSuccessor = edgeGroups.get(startNodes[0].id!.toString())?.get(DEFAULT_ACTION)?.[0]
			if (firstSuccessor) {
				const allConverge = startNodes.slice(1).every(node => edgeGroups.get(node.id!.toString())?.get(DEFAULT_ACTION)?.[0] === firstSuccessor)
				if (allConverge)
					parallelStartNode.next(firstSuccessor)
			}
		}

		const flow = new Flow(parallelStartNode)
		return { flow, nodeMap, predecessorCountMap }
	}
}

import type { Logger } from '../logger'
import type { FILTER_FAILED, NodeArgs } from '../types'
import type { AbstractNode } from '../workflow'
import type { BuildResult, GraphBuilderOptions, GraphEdge, GraphNode, NodeRegistry, NodeTypeMap, OriginalPredecessorIdMap, PredecessorIdMap, TypedNodeRegistry, TypedWorkflowGraph, WorkflowGraph } from './graph.types'
import { NullLogger } from '../logger'
import { DEFAULT_ACTION } from '../types'
import { generateMermaidGraph } from '../utils/mermaid'
import { Flow, Node } from '../workflow'
import { ParallelFlow } from './patterns'

/**
 * A type-safe helper function for creating a `TypedNodeRegistry`.
 * This function preserves the strong typing of the registry object, enabling
 * compile-time validation of `TypedWorkflowGraph` definitions.
 *
 * @param registry The registry object, where keys are node types and values are `Node` constructors.
 * @returns The same registry object, correctly typed for use with `GraphBuilder`.
 */
export function createNodeRegistry<
	TNodeMap extends NodeTypeMap,
	TContext = object,
>(registry: TypedNodeRegistry<TNodeMap, TContext>): TypedNodeRegistry<TNodeMap, TContext> {
	return registry
}

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

/** A private class used by the builder to represent parallel execution blocks. */
class ParallelBranchContainer extends ParallelFlow {
	/** A tag to reliably identify this node type in the visualizer. */
	public readonly isParallelContainer = true
	constructor(public readonly nodesToRun: AbstractNode[]) { super(nodesToRun) }
}

/**
 * Constructs an executable `Flow` from a declarative `WorkflowGraph` definition.
 * @template TNodeMap A `NodeTypeMap` for validating type-safe graph definitions.
 * @template TContext The shape of the dependency injection context object.
 */
export class GraphBuilder<
	TNodeMap extends NodeTypeMap,
	TContext extends { registry?: any } = object,
> {
	private registry: Map<string, new (...args: any[]) => AbstractNode>
	private subWorkflowNodeTypes: string[]
	private logger: Logger

	/**
	 * @param registry A type-safe object or a `Map` where keys are node `type` strings and
	 * values are the corresponding `Node` class constructors. For type-safety, use `createNodeRegistry`.
	 * @param nodeOptionsContext An optional object that is passed to every node's
	 * constructor, useful for dependency injection (e.g., passing a database client or the builder itself).
	 */
	// type-safe overload
	constructor(registry: TypedNodeRegistry<TNodeMap, TContext>, nodeOptionsContext?: TContext, options?: GraphBuilderOptions, logger?: Logger)
	// untyped overload
	constructor(registry: NodeRegistry, nodeOptionsContext?: Record<string, any>, options?: GraphBuilderOptions, logger?: Logger)
	// handle both cases
	constructor(
		registry: TypedNodeRegistry<TNodeMap, TContext> | NodeRegistry,
		private nodeOptionsContext: TContext | Record<string, any> = {},
		options: GraphBuilderOptions = {},
		logger: Logger = new NullLogger(),
	) {
		this.logger = logger
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

	private _logMermaid(flow: Flow) {
		if (!(this.logger instanceof NullLogger)) {
			this.logger.debug('[GraphBuilder] Flattened Graph')
			const mermaid = generateMermaidGraph(flow)
			mermaid.split('\n').forEach(line => this.logger.debug(line))
		}
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

			const newNodeData = JSON.parse(JSON.stringify(node.data || {}))

			if (newNodeData.inputs) {
				const inputs = newNodeData.inputs as Record<string, string | string[]>
				for (const [templateKey, sourcePathOrPaths] of Object.entries(inputs)) {
					const sourcePaths = Array.isArray(sourcePathOrPaths) ? sourcePathOrPaths : [sourcePathOrPaths]
					const newSourcePaths = sourcePaths.map((sourcePath) => {
						if (localNodeIds.has(sourcePath))
							return `${idPrefix}${sourcePath}`
						return sourcePath
					})
					inputs[templateKey] = Array.isArray(sourcePathOrPaths) ? newSourcePaths : newSourcePaths[0]
				}
			}

			if (isRegisteredSubWorkflow) {
				this.logger.debug(`[GraphBuilder] Inlining sub-workflow node '${prefixedNodeId}'...`)
				const subWorkflowData = node.data as any
				const subWorkflowId = subWorkflowData.workflowId
				const registry = this.nodeOptionsContext.registry as any
				if (!registry || typeof registry.getGraph !== 'function')
					throw new Error('GraphBuilder needs a registry with a `getGraph` method in its context to resolve sub-workflows.')

				const subGraph: WorkflowGraph | undefined = registry.getGraph(subWorkflowId)
				if (!subGraph)
					throw new Error(`Sub-workflow with ID ${subWorkflowId} not found in registry.`)

				this.logger.debug(`[GraphBuilder]   -> Fetched graph for sub-workflow ID: ${subWorkflowId}`)

				const inputMapperId = `${prefixedNodeId}_input_mapper`
				const outputMapperId = `${prefixedNodeId}_output_mapper`
				finalNodes.push({
					id: inputMapperId,
					type: '__internal_input_mapper__',
					data: { ...(subWorkflowData.inputs || {}), originalId: node.id },
				})
				finalNodes.push({
					id: outputMapperId,
					type: '__internal_output_mapper__',
					data: { ...(subWorkflowData.outputs || {}), originalId: node.id },
				})

				const inlinedSubGraph = this._flattenGraph(subGraph, `${prefixedNodeId}:`)
				const augmentedInlinedNodes = inlinedSubGraph.nodes.map(n => ({
					...n,
					data: { ...(n.data || {}), isSubWorkflow: true },
				}))
				finalNodes.push(...augmentedInlinedNodes)
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
				const finalNodeData = { ...newNodeData, originalId: node.id }
				finalNodes.push({ ...node, id: prefixedNodeId, data: finalNodeData })
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
	build(graph: TypedWorkflowGraph<TNodeMap>): BuildResult
	// untyped overload
	build(graph: WorkflowGraph): BuildResult
	// single implementation that handles both cases
	build(graph: TypedWorkflowGraph<TNodeMap> | WorkflowGraph): BuildResult {
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
			const executableNode = new NodeClass(nodeOptions)
				.withId(graphNode.id)
				.withGraphData(graphNode)
			if (graphNode.config) {
				if (executableNode instanceof Node) {
					executableNode.maxRetries = graphNode.config.maxRetries ?? executableNode.maxRetries
					executableNode.wait = graphNode.config.wait ?? executableNode.wait
				}
				else {
					this.logger.warn(`[GraphBuilder] Node '${graphNode.id}' has a 'config' block in its definition, but its class '${executableNode.constructor.name}' does not extend 'Node', so retry options cannot be applied.`)
				}
			}
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
					sourceNode.next(successors[0], action)
				}
				else if (successors.length > 1) {
					const parallelNode = new ParallelBranchContainer(successors)
					sourceNode.next(parallelNode, action)

					const convergenceNode = this._findConvergenceNode(successors, edgeGroups)
					if (convergenceNode)
						parallelNode.next(convergenceNode)
				}
			}
		}

		// Final Step: Determine the start node(s) for the entire flow.
		const allNodeIds = Array.from(nodeMap.keys())
		const allTargetIds = new Set(flatGraph.edges.map(e => e.target))
		const startNodeIds = allNodeIds.filter(id => !allTargetIds.has(id))

		if (startNodeIds.length === 0 && allNodeIds.length > 0)
			throw new Error('GraphBuilder: This graph has a cycle and no clear start node.')

		const { predecessorIdMap, originalPredecessorIdMap } = this._createPredecessorIdMaps(flatGraph, nodeMap)

		if (startNodeIds.length === 1) {
			const startNode = nodeMap.get(startNodeIds[0])!
			const flow = new Flow(startNode)
			this._logMermaid(flow)
			return { flow, nodeMap, predecessorCountMap, predecessorIdMap, originalPredecessorIdMap }
		}

		const startNodes = startNodeIds.map(id => nodeMap.get(id)!)
		const parallelStartNode = new ParallelBranchContainer(startNodes)

		if (startNodes.length > 1) {
			const convergenceNode = this._findConvergenceNode(startNodes, edgeGroups)
			if (convergenceNode)
				parallelStartNode.next(convergenceNode)
		}

		const flow = new Flow(parallelStartNode)
		this._logMermaid(flow)
		return { flow, nodeMap, predecessorCountMap, predecessorIdMap, originalPredecessorIdMap }
	}

	/**
	 * Creates a map of each node ID to an array of its direct predecessor node IDs.
	 * This is a helper for executors that need to know a node's direct inputs.
	 * @param graph The flattened workflow graph.
	 * @returns A map where each key is a node ID and the value is an array of its predecessor IDs.
	 * @private
	 */
	private _createPredecessorIdMaps(
		graph: WorkflowGraph,
		nodeMap: Map<string, AbstractNode>,
	): { predecessorIdMap: PredecessorIdMap, originalPredecessorIdMap: OriginalPredecessorIdMap } {
		const predecessorIdMap: PredecessorIdMap = new Map()
		const originalPredecessorIdMap: OriginalPredecessorIdMap = new Map()

		for (const edge of graph.edges) {
			if (!predecessorIdMap.has(edge.target))
				predecessorIdMap.set(edge.target, [])
			predecessorIdMap.get(edge.target)!.push(edge.source)

			const sourceNode = nodeMap.get(edge.source)!
			const targetNode = nodeMap.get(edge.target)!

			const sourceOriginalId = sourceNode.graphData?.data?.originalId
			const targetNamespacedId = targetNode.id as string

			if (sourceOriginalId) {
				if (!originalPredecessorIdMap.has(targetNamespacedId))
					originalPredecessorIdMap.set(targetNamespacedId, [])

				const originalPreds = originalPredecessorIdMap.get(targetNamespacedId)!
				if (!originalPreds.includes(sourceOriginalId))
					originalPreds.push(sourceOriginalId)
			}
		}
		return { predecessorIdMap, originalPredecessorIdMap }
	}

	/**
	 * Finds the first node where all parallel branches converge.
	 * Uses a Breadth-First Search to guarantee finding the nearest convergence point.
	 * @param parallelNodes - The set of nodes running in parallel.
	 * @param edgeGroups - The map of all graph edges.
	 * @returns The convergence node, or undefined if they never converge.
	 * @private
	 */
	private _findConvergenceNode(
		parallelNodes: AbstractNode[],
		edgeGroups: Map<string, Map<any, AbstractNode[]>>,
	): AbstractNode | undefined {
		if (parallelNodes.length <= 1)
			return undefined

		const queue: string[] = parallelNodes.map(n => String(n.id!))
		const visitedBy = new Map<string, Set<string>>()
		parallelNodes.forEach(n => visitedBy.set(String(n.id!), new Set([String(n.id!)])))

		let head = 0
		while (head < queue.length) {
			const currentId = queue[head++]!
			const successors = Array.from(edgeGroups.get(currentId)?.values() ?? []).flat()

			for (const successor of successors) {
				const successorId = String(successor.id!)
				if (!visitedBy.has(successorId))
					visitedBy.set(successorId, new Set())

				const visitorSet = visitedBy.get(successorId)!
				const startingPointsVistingThisNode = visitedBy.get(currentId)!

				for (const startNodeId of startingPointsVistingThisNode)
					visitorSet.add(startNodeId)

				if (visitorSet.size === parallelNodes.length) {
					this.logger.debug(`[GraphBuilder] Found convergence node: ${successorId}`)
					return successor
				}

				if (!queue.includes(successorId))
					queue.push(successorId)
			}
		}

		this.logger.warn('[GraphBuilder] Parallel branches do not seem to converge.')
		return undefined
	}
}

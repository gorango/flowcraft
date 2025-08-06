import type { Logger } from '../logger'
import type { FILTER_FAILED, NodeArgs } from '../types'
import type { AbstractNode } from '../workflow'
import type { BuildResult, GraphBuilderOptions, GraphEdge, GraphNode, NodeRegistry, NodeTypeMap, OriginalPredecessorIdMap, PredecessorIdMap, SubWorkflowResolver, TypedNodeRegistry, TypedWorkflowGraph, WorkflowGraph } from './graph.types'
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
		// Exclude the injected nodeId from the mappings
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
		// Exclude the injected nodeId from the mappings
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

/**
 * A private class used by the builder to represent the sub-workflow container itself.
 * It's a structural node that preserves the original node ID in the flattened graph.
 * @internal
 */
class SubWorkflowContainerNode extends Node {
	constructor() {
		super()
		this.isPassthrough = true
	}

	async exec() {
		// This node performs no work; it just acts as a stable entry point.
		// The graph wiring ensures the InputMappingNode is executed next.
	}
}

/** A private class used by the builder to represent parallel execution blocks. */
class ParallelBranchContainer extends ParallelFlow {
	/** A tag to reliably identify this node type in the visualizer. */
	public readonly isParallelContainer = true

	constructor(public readonly nodesToRun: AbstractNode[]) {
		super(nodesToRun)
		// semantic flag for distributed executors.
		this.isPassthrough = true
	}
}

/**
 * A private class used by the builder to unify conditional branches
 * before they connect to a common successor. This ensures the successor
 * only has one predecessor, preventing false fan-in detection.
 * @internal
 */
class ConditionalJoinNode extends Node {
	constructor() {
		super()
		this.isPassthrough = true // It performs no logic, just structural
	}
}

/**
 * Constructs an executable `Flow` from a declarative `WorkflowGraph` definition.
 * @template TNodeMap A `NodeTypeMap` for validating type-safe graph definitions.
 * @template TContext The shape of the dependency injection context object.
 */
export class GraphBuilder<
	TNodeMap extends NodeTypeMap,
	TContext extends object = object,
> {
	private registry: Map<string, new (...args: any[]) => AbstractNode>
	private subWorkflowNodeTypes: string[]
	private conditionalNodeTypes: string[]
	private subWorkflowResolver?: SubWorkflowResolver
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
		this.registry = registry instanceof Map ? registry : new Map(Object.entries(registry))
		if (!this.registry.has('__internal_input_mapper__'))
			this.registry.set('__internal_input_mapper__', InputMappingNode as any)
		if (!this.registry.has('__internal_output_mapper__'))
			this.registry.set('__internal_output_mapper__', OutputMappingNode as any)
		if (!this.registry.has('__internal_sub_workflow_container__'))
			this.registry.set('__internal_sub_workflow_container__', SubWorkflowContainerNode as any)
		if (!this.registry.has('__internal_conditional_join__'))
			this.registry.set('__internal_conditional_join__', ConditionalJoinNode as any)
		this.subWorkflowNodeTypes = options.subWorkflowNodeTypes ?? []
		this.conditionalNodeTypes = options.conditionalNodeTypes ?? []
		this.subWorkflowResolver = options.subWorkflowResolver
	}

	private _logMermaid(flow: Flow) {
		if (!(this.logger instanceof NullLogger)) {
			this.logger.info('[GraphBuilder] Flattened Graph')
			const mermaid = generateMermaidGraph(flow)
			mermaid.split('\n').forEach(line => this.logger.info(line))
		}
	}

	private _flattenGraph(graph: WorkflowGraph, idPrefix = ''): WorkflowGraph {
		const finalNodes: GraphNode[] = []
		const finalEdges: GraphEdge[] = []

		const localNodeIds = new Set(graph.nodes.map(n => n.id))

		for (const node of graph.nodes) {
			const prefixedNodeId = `${idPrefix}${node.id}`
			const sanitizedId = prefixedNodeId.replace(/:/g, '_').replace(/\W/g, '')

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
				if (!this.subWorkflowResolver)
					throw new Error('GraphBuilder: `subWorkflowResolver` must be provided in options to handle sub-workflows.')

				const subWorkflowData = node.data as any
				const subWorkflowId = subWorkflowData.workflowId
				const subGraph: WorkflowGraph | undefined = this.subWorkflowResolver.getGraph(subWorkflowId)
				if (!subGraph)
					throw new Error(`Sub-workflow with ID ${subWorkflowId} not found in resolver.`)

				finalNodes.push({
					id: prefixedNodeId,
					type: '__internal_sub_workflow_container__',
					data: { ...newNodeData, originalId: node.id },
				})

				const inputMapperId = `${sanitizedId}_input_mapper`
				const outputMapperId = `${sanitizedId}_output_mapper`
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

				finalEdges.push({ source: prefixedNodeId, target: inputMapperId })

				const subGraphStartIds = inlinedSubGraph.nodes.map(n => n.id).filter(id => !inlinedSubGraph.edges.some(e => e.target === id))
				for (const startId of subGraphStartIds)
					finalEdges.push({ source: inputMapperId, target: startId })

				const subGraphTerminalIds = inlinedSubGraph.nodes.map(n => n.id).filter(id => !inlinedSubGraph.edges.some(e => e.source === id))
				for (const terminalId of subGraphTerminalIds)
					finalEdges.push({ source: terminalId, target: outputMapperId })
			}
			else if (hasWorkflowId) {
				throw new Error(`Node with ID '${node.id}' has a 'workflowId' but its type '${node.type}' is not in 'subWorkflowNodeTypes'.`)
			}
			else {
				finalNodes.push({ ...node, id: prefixedNodeId, data: { ...newNodeData, originalId: node.id } })
			}
		}

		// Pass 2: Re-wire all original edges to connect to the correct nodes in the flattened graph.
		for (const edge of graph.edges) {
			const sourceNode = graph.nodes.find(n => n.id === edge.source)!
			const prefixedSourceId = `${idPrefix}${edge.source}`
			const prefixedTargetId = `${idPrefix}${edge.target}`

			const isSourceSub = this.subWorkflowNodeTypes.includes(sourceNode.type)
			const sanitizedSourceId = prefixedSourceId.replace(/:/g, '_').replace(/\W/g, '')

			if (isSourceSub) {
				finalEdges.push({ ...edge, source: `${sanitizedSourceId}_output_mapper`, target: prefixedTargetId })
			}
			else {
				finalEdges.push({ ...edge, source: prefixedSourceId, target: prefixedTargetId })
			}
		}
		return { nodes: finalNodes, edges: finalEdges }
	}

	/**
	 * Builds a runnable `Flow` from a graph definition.
	 * @param graph The `WorkflowGraph` object describing the flow.
	 * @param log Whether to log the graph after flattening. Defaults to `false`.
	 * @returns A `BuildResult` object containing the executable `flow` and a `nodeMap`.
	 */
	// type-safe overload
	build(graph: TypedWorkflowGraph<TNodeMap>, log?: boolean): BuildResult
	// untyped overload
	build(graph: WorkflowGraph, log?: boolean): BuildResult
	// single implementation that handles both cases
	build(graph: TypedWorkflowGraph<TNodeMap> | WorkflowGraph, log?: boolean): BuildResult {
		// Step 1: Flatten the graph to resolve all sub-workflows.
		const flatGraph = this._flattenGraph(graph as WorkflowGraph)

		// Step 2: Instantiate all node objects. We need these for the convergence logic.
		const nodeMap = new Map<string, AbstractNode>()
		for (const graphNode of flatGraph.nodes) {
			const NodeClass = this.registry.get(graphNode.type.toString())
			if (!NodeClass)
				throw new Error(`GraphBuilder: Node type '${graphNode.type.toString()}' not found in registry.`)

			const nodeOptions = {
				...this.nodeOptionsContext,
				data: { ...graphNode.data, nodeId: graphNode.id },
			}
			const executableNode = new NodeClass(nodeOptions).withId(graphNode.id).withGraphData(graphNode)
			if (graphNode.config && executableNode instanceof Node) {
				executableNode.maxRetries = graphNode.config.maxRetries ?? executableNode.maxRetries
				executableNode.wait = graphNode.config.wait ?? executableNode.wait
			}
			nodeMap.set(graphNode.id, executableNode)
		}

		// Step 3: Handle conditional branch convergence. This is a logical transformation
		// that modifies the `flatGraph` by inserting join nodes and rewiring edges.
		const edgeGroupsForConvergence = flatGraph.edges.reduce((acc, edge) => {
			if (!acc.has(edge.source))
				acc.set(edge.source, new Map())
			const sourceActions = acc.get(edge.source)!
			const action = edge.action || DEFAULT_ACTION
			if (!sourceActions.has(action))
				sourceActions.set(action, [])
			sourceActions.get(action)!.push(nodeMap.get(edge.target)!)
			return acc
		}, new Map<string, Map<any, AbstractNode[]>>())

		const conditionalNodes = flatGraph.nodes.filter(n => this.conditionalNodeTypes.includes(n.type))
		for (const conditionalNode of conditionalNodes) {
			const branches = flatGraph.edges
				.filter(e => e.source === conditionalNode.id)
				.map(e => nodeMap.get(e.target)!)
				.filter(Boolean)

			if (branches.length > 1) {
				const convergenceNode = this._findConvergenceNode(branches, edgeGroupsForConvergence)

				if (convergenceNode) {
					const joinNodeId = `${conditionalNode.id}__conditional_join`
					if (!nodeMap.has(joinNodeId)) {
						this.logger.debug(`[GraphBuilder] Inserting conditional join node for '${conditionalNode.id}' converging at '${convergenceNode.id}'`)

						const joinGraphNode: GraphNode = { id: joinNodeId, type: '__internal_conditional_join__', data: {} }
						const joinNode = new ConditionalJoinNode().withId(joinNodeId).withGraphData(joinGraphNode)
						nodeMap.set(joinNodeId, joinNode)
						flatGraph.nodes.push(joinGraphNode)

						const branchTerminalNodes = this._findBranchTerminals(branches, String(convergenceNode.id), edgeGroupsForConvergence)

						for (const terminalId of branchTerminalNodes) {
							const edgeIndex = flatGraph.edges.findIndex(e => e.source === terminalId && e.target === convergenceNode.id)
							if (edgeIndex > -1) {
								flatGraph.edges[edgeIndex].target = joinNodeId
							}
						}
						flatGraph.edges.push({ source: joinNodeId, target: String(convergenceNode.id!) })
					}
				}
			}
		}

		// Step 4: Perform logical analysis AFTER conditional rewiring.
		// This builds the predecessor maps from the now-modified `flatGraph`.
		const { predecessorIdMap, originalPredecessorIdMap } = this._createPredecessorIdMaps(flatGraph, nodeMap)
		const predecessorCountMap = new Map<string, number>()
		for (const [key, val] of predecessorIdMap.entries()) {
			predecessorCountMap.set(key, val.length)
		}

		// Special case: The inserted conditional join node should always have a predecessor count of 1
		// to prevent it from stalling a distributed executor.
		for (const [nodeId, nodeInstance] of nodeMap.entries()) {
			if (nodeInstance instanceof ConditionalJoinNode) {
				predecessorCountMap.set(nodeId, 1)
			}
		}

		// Step 5: Wire the final object graph, introducing implementation-specific containers
		// like ParallelBranchContainer and their shortcuts for the InMemoryExecutor.
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

		for (const [sourceId, actions] of edgeGroups.entries()) {
			const sourceNode = nodeMap.get(sourceId)!
			for (const [action, successors] of actions.entries()) {
				if (successors.length > 0) {
					if (this.conditionalNodeTypes.includes(sourceNode.graphData!.type)) {
						for (const successor of successors) {
							sourceNode.next(successor, action)
						}
					}
					else if (successors.length > 1) {
						const parallelNodeId = `${sourceId}__parallel_container`
						const parallelGraphNode: GraphNode = { id: parallelNodeId, type: '__internal_parallel_container__', data: {} }
						const parallelNode = new ParallelBranchContainer(successors).withId(parallelNodeId).withGraphData(parallelGraphNode)
						nodeMap.set(parallelNodeId, parallelNode)
						sourceNode.next(parallelNode, action)

						// This shortcut is for the InMemoryExecutor and does not affect the logical maps.
						const convergenceNode = this._findConvergenceNode(successors, edgeGroups)
						if (convergenceNode)
							parallelNode.next(convergenceNode)
					}
					else {
						sourceNode.next(successors[0], action)
					}
				}
			}
		}

		// Step 6: Determine the final start node for the flow.
		const allNodeIds = new Set(flatGraph.nodes.map(n => n.id))
		const allTargetIds = new Set(flatGraph.edges.map(e => e.target))
		const startNodeIds = [...allNodeIds].filter(id => !allTargetIds.has(id))

		if (startNodeIds.length === 0 && allNodeIds.size > 0)
			throw new Error('GraphBuilder: This graph has a cycle and no clear start node.')

		// Finalize predecessor counts for any nodes that had no predecessors.
		for (const id of allNodeIds) {
			if (!predecessorCountMap.has(id))
				predecessorCountMap.set(id, 0)
		}

		let startNode: AbstractNode
		if (startNodeIds.length === 1) {
			startNode = nodeMap.get(startNodeIds[0])!
		}
		else {
			const startNodes = startNodeIds.map(id => nodeMap.get(id)!)
			const parallelStartNode = new ParallelBranchContainer(startNodes).withId('__root_parallel_start')
			nodeMap.set(String(parallelStartNode.id), parallelStartNode)
			const convergenceNode = this._findConvergenceNode(startNodes, edgeGroups)
			if (convergenceNode)
				parallelStartNode.next(convergenceNode)
			startNode = parallelStartNode
		}

		// Step 7: Return the executable flow and the now-correct logical analysis results.
		const flow = new Flow(startNode)
		if (log)
			this._logMermaid(flow)
		return { flow, nodeMap, predecessorCountMap, predecessorIdMap, originalPredecessorIdMap }
	}

	/**
	 * Finds the terminal nodes of a set of branches before they hit a specific target.
	 * @private
	 */
	private _findBranchTerminals(branches: AbstractNode[], targetId: string, edgeGroups: Map<string, Map<any, AbstractNode[]>>): string[] {
		const terminals: string[] = []
		const queue: string[] = branches.map(n => String(n.id))
		const visited = new Set<string>()

		while (queue.length > 0) {
			const currentId = queue.shift()!
			if (visited.has(currentId))
				continue
			visited.add(currentId)

			const successors = Array.from(edgeGroups.get(currentId)?.values() ?? []).flat().map(n => String(n.id))

			if (successors.includes(targetId)) {
				if (!terminals.includes(currentId)) {
					terminals.push(currentId)
				}
			}
			else {
				for (const successorId of successors) {
					if (!visited.has(successorId)) {
						queue.push(successorId)
					}
				}
			}
		}
		return terminals
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
		nodeMap: Map<string, AbstractNode>, // The nodeMap is required here
	): { predecessorIdMap: PredecessorIdMap, originalPredecessorIdMap: OriginalPredecessorIdMap } {
		const predecessorIdMap: PredecessorIdMap = new Map()
		const originalPredecessorIdMap: OriginalPredecessorIdMap = new Map()

		for (const edge of graph.edges) {
			// --- Build the standard predecessorIdMap ---
			if (!predecessorIdMap.has(edge.target))
				predecessorIdMap.set(edge.target, [])
			predecessorIdMap.get(edge.target)!.push(edge.source)

			// --- Build the originalPredecessorIdMap (for sub-workflows) ---
			// This is the crucial logic that was removed and is now restored.
			const sourceNode = nodeMap.get(edge.source)
			const targetNode = nodeMap.get(edge.target)

			// The nodeMap is guaranteed to have these nodes at this stage of the build process.
			if (!sourceNode || !targetNode)
				continue

			const sourceOriginalId = sourceNode.graphData?.data?.originalId
			const targetOriginalId = targetNode.graphData?.data?.originalId

			// The mapKey is the original ID of the target node, which allows the orchestrator
			// to correctly associate outputs from a sub-workflow to the next step in the parent.
			const mapKey = targetOriginalId ?? targetNode.id as string

			if (sourceOriginalId && mapKey) {
				if (!originalPredecessorIdMap.has(mapKey))
					originalPredecessorIdMap.set(mapKey, [])

				const originalPreds = originalPredecessorIdMap.get(mapKey)!
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

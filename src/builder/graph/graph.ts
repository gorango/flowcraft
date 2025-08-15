import type { Logger } from '../../logger'
import type { AbstractNode, Flow } from '../../workflow/index'
import type {
	BlueprintBuildResult,
	BuildResult,
	GraphBuilderOptions,
	GraphEdge,
	GraphNode,
	NodeRegistry,
	NodeTypeMap,
	OriginalPredecessorIdMap,
	PredecessorIdMap,
	SubWorkflowResolver,
	TypedNodeRegistry,
	TypedWorkflowGraph,
	WorkflowBlueprint,
	WorkflowGraph,
} from './types'
import { NullLogger } from '../../logger'
import { DEFAULT_ACTION } from '../../types'
import { generateMermaidGraph } from '../../utils/mermaid'
import {
	ConditionalJoinNode,
	InputMappingNode,
	OutputMappingNode,
	ParallelBranchContainer,
	SubWorkflowContainerNode,
} from './internal-nodes'
import { BlueprintExecutor } from './runner'

/**
 * A smart factory that takes an object of custom node classes and returns a fully
 * prepared `NodeRegistry` map with all internal nodes required by the GraphBuilder.
 *
 * @param registry An object where keys are node type strings and values are the corresponding Node constructors.
 * @returns A `Map` instance ready to be used by the `GraphBuilder` or a custom executor.
 */
export function createNodeRegistry<
	TNodeMap extends NodeTypeMap,
	TContext = object,
>(registry: TypedNodeRegistry<TNodeMap, TContext>): NodeRegistry {
	const finalRegistry: NodeRegistry = new Map()

	for (const key in registry) {
		if (Object.prototype.hasOwnProperty.call(registry, key))
			finalRegistry.set(key, registry[key])
	}

	if (!finalRegistry.has('__internal_input_mapper__'))
		finalRegistry.set('__internal_input_mapper__', InputMappingNode as any)
	if (!finalRegistry.has('__internal_output_mapper__'))
		finalRegistry.set('__internal_output_mapper__', OutputMappingNode as any)
	if (!finalRegistry.has('__internal_sub_workflow_container__'))
		finalRegistry.set('__internal_sub_workflow_container__', SubWorkflowContainerNode as any)
	if (!finalRegistry.has('__internal_conditional_join__'))
		finalRegistry.set('__internal_conditional_join__', ConditionalJoinNode as any)
	if (!finalRegistry.has('__internal_parallel_container__'))
		finalRegistry.set('__internal_parallel_container__', ParallelBranchContainer as any)

	return finalRegistry
}

/**
 * Constructs a serializable `WorkflowBlueprint` from a declarative `WorkflowGraph` definition.
 * The blueprint is a static, storable artifact that can be executed by a `BlueprintExecutor`.
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
		this.registry = registry instanceof Map
			? registry
			: createNodeRegistry(registry as TypedNodeRegistry<TNodeMap, TContext>)
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

			if (isSourceSub)
				finalEdges.push({ ...edge, source: `${sanitizedSourceId}_output_mapper`, target: prefixedTargetId })
			else
				finalEdges.push({ ...edge, source: prefixedSourceId, target: prefixedTargetId })
		}
		return { nodes: finalNodes, edges: finalEdges }
	}

	/**
	 * Builds a runnable `Flow` from a graph definition for immediate in-memory execution.
	 * @param graph The `WorkflowGraph` object describing the flow.
	 * @param log Whether to log the graph after flattening. Defaults to `false`.
	 * @returns A `BuildResult` object containing the executable `flow` and a `nodeMap`.
	 */
	public build(graph: TypedWorkflowGraph<TNodeMap>, log?: boolean): BuildResult
	public build(graph: WorkflowGraph, log?: boolean): BuildResult
	public build(graph: TypedWorkflowGraph<TNodeMap> | WorkflowGraph, log?: boolean): BuildResult {
		const { blueprint } = this.buildBlueprint(graph as WorkflowGraph)
		const executor = new BlueprintExecutor(blueprint, this.registry, this.nodeOptionsContext)

		if (log)
			this._logMermaid(executor.flow)

		return {
			flow: executor.flow,
			nodeMap: executor.nodeMap,
			predecessorCountMap: new Map(Object.entries(blueprint.predecessorCountMap)),
			predecessorIdMap: new Map(Object.entries(blueprint.originalPredecessorIdMap).map(([k, v]) => [k, v])),
			originalPredecessorIdMap: new Map(Object.entries(blueprint.originalPredecessorIdMap).map(([k, v]) => [k, v])),
		}
	}

	/**
	 * Builds a serializable `WorkflowBlueprint` from a graph definition.
	 * This is the recommended method for preparing a workflow for a distributed environment.
	 * @param graph The `WorkflowGraph` object describing the flow.
	 * @returns A `BlueprintBuildResult` object containing the serializable `blueprint`.
	 */
	// type-safe overload
	public buildBlueprint(graph: TypedWorkflowGraph<TNodeMap>): BlueprintBuildResult
	// untyped overload
	public buildBlueprint(graph: WorkflowGraph): BlueprintBuildResult
	// single implementation that handles both cases
	public buildBlueprint(graph: TypedWorkflowGraph<TNodeMap> | WorkflowGraph): BlueprintBuildResult {
		const flatGraph = this._flattenGraph(graph as WorkflowGraph)

		const conditionalNodes = flatGraph.nodes.filter(n => this.conditionalNodeTypes.includes(n.type))
		for (const conditionalNode of conditionalNodes) {
			const branches = flatGraph.edges
				.filter(e => e.source === conditionalNode.id)
				.map(e => e.target)

			if (branches.length > 1) {
				const convergenceTargetId = this._findConditionalConvergence(branches, flatGraph)
				if (convergenceTargetId) {
					const joinNodeId = `${conditionalNode.id}__conditional_join`
					if (!flatGraph.nodes.some(n => n.id === joinNodeId)) {
						this.logger.debug(`[GraphBuilder] Inserting conditional join node for '${conditionalNode.id}' converging at '${convergenceTargetId}'`)
						flatGraph.nodes.push({ id: joinNodeId, type: '__internal_conditional_join__', data: {} })
						const branchTerminalIds = this._findBranchTerminals(branches, convergenceTargetId, flatGraph)
						for (const terminalId of branchTerminalIds) {
							const edgeIndex = flatGraph.edges.findIndex(e => e.source === terminalId && e.target === convergenceTargetId)
							if (edgeIndex > -1) {
								flatGraph.edges[edgeIndex].target = joinNodeId
							}
						}
						flatGraph.edges.push({ source: joinNodeId, target: convergenceTargetId })
					}
				}
			}
		}

		const edgeGroups = flatGraph.edges.reduce((acc, edge) => {
			if (!acc.has(edge.source))
				acc.set(edge.source, new Map())
			const sourceActions = acc.get(edge.source)!
			const action = edge.action || DEFAULT_ACTION
			if (!sourceActions.has(action))
				sourceActions.set(action, [])
			sourceActions.get(action)!.push(edge.target)
			return acc
		}, new Map<string, Map<any, string[]>>())

		const nodesToProcess = [...flatGraph.nodes]
		for (const sourceNode of nodesToProcess) {
			const actions = edgeGroups.get(sourceNode.id)
			if (!actions)
				continue

			for (const [action, successors] of actions.entries()) {
				if (successors.length > 1 && !this.conditionalNodeTypes.includes(sourceNode.type)) {
					const parallelNodeId = `${sourceNode.id}__parallel_container`
					if (!flatGraph.nodes.some(n => n.id === parallelNodeId)) {
						flatGraph.nodes.push({ id: parallelNodeId, type: '__internal_parallel_container__', data: {} })
						const edgesToReplace = flatGraph.edges.filter(e => e.source === sourceNode.id && (e.action || DEFAULT_ACTION) === action)
						flatGraph.edges = flatGraph.edges.filter(e => !edgesToReplace.includes(e))
						flatGraph.edges.push({ source: sourceNode.id, target: parallelNodeId, action: action === DEFAULT_ACTION ? undefined : String(action) })
						successors.forEach(succId => flatGraph.edges.push({ source: parallelNodeId, target: succId }))
					}
				}
			}
		}

		const { predecessorIdMap, originalPredecessorIdMap } = this._createPredecessorIdMaps(flatGraph)
		const predecessorCountMap = new Map<string, number>()
		for (const [key, val] of predecessorIdMap.entries()) {
			predecessorCountMap.set(key, val.length)
		}

		const allNodeIds = new Set(flatGraph.nodes.map(n => n.id))
		for (const id of allNodeIds) {
			if (!predecessorCountMap.has(id))
				predecessorCountMap.set(id, 0)
		}

		const allTargetIds = new Set(flatGraph.edges.map(e => e.target))
		const startNodeIds = [...allNodeIds].filter(id => !allTargetIds.has(id))
		let startNodeId: string

		if (startNodeIds.length === 0 && allNodeIds.size > 0)
			throw new Error('GraphBuilder: This graph has a cycle and no clear start node.')

		if (startNodeIds.length === 1) {
			startNodeId = startNodeIds[0]
		}
		else {
			startNodeId = '__root_parallel_start'
			if (!flatGraph.nodes.some(n => n.id === startNodeId)) {
				flatGraph.nodes.push({ id: startNodeId, type: '__internal_parallel_container__', data: {} })
				for (const id of startNodeIds)
					flatGraph.edges.push({ source: startNodeId, target: id })
			}
		}

		const blueprint: WorkflowBlueprint = {
			nodes: flatGraph.nodes,
			edges: flatGraph.edges,
			startNodeId,
			predecessorCountMap: Object.fromEntries(predecessorCountMap.entries()),
			originalPredecessorIdMap: Object.fromEntries(originalPredecessorIdMap.entries()),
		}

		return { blueprint }
	}

	private _createPredecessorIdMaps(
		graph: WorkflowGraph,
	): { predecessorIdMap: PredecessorIdMap, originalPredecessorIdMap: OriginalPredecessorIdMap } {
		const predecessorIdMap: PredecessorIdMap = new Map()
		for (const edge of graph.edges) {
			if (!predecessorIdMap.has(edge.target))
				predecessorIdMap.set(edge.target, [])
			predecessorIdMap.get(edge.target)!.push(edge.source)
		}

		const originalPredecessorIdMap: OriginalPredecessorIdMap = new Map()
		const nodeDataMap = new Map(graph.nodes.map(n => [n.id, n]))
		const memo = new Map<string, string[]>()

		const findOriginalProducers = (nodeId: string): string[] => {
			if (memo.has(nodeId))
				return memo.get(nodeId)!

			const nodeData = nodeDataMap.get(nodeId)
			if (!nodeData)
				return []

			const selfType = nodeData.type
			const selfOriginalId = nodeData.data?.originalId ?? nodeId

			// Base Case: User-defined nodes are always the source of data.
			if (!selfType.startsWith('__internal_')) {
				const result = [selfOriginalId]
				memo.set(nodeId, result)
				return result
			}

			// Special Case: The output mapper acts as the logical source for anything
			// outside the sub-workflow. It represents the sub-workflow's result.
			if (selfType === '__internal_output_mapper__') {
				// The originalId of the output_mapper is the ID of the container.
				const result = [selfOriginalId]
				memo.set(nodeId, result)
				return result
			}

			// Recursive Step: For all other internal nodes (input_mapper, container, join),
			// they are transparent wiring. Look through them.
			const directPredecessors = predecessorIdMap.get(nodeId) || []
			const producers = new Set<string>()
			for (const predId of directPredecessors) {
				findOriginalProducers(predId).forEach(p => producers.add(p))
			}

			const result = Array.from(producers)
			memo.set(nodeId, result)
			return result
		}

		for (const targetId of nodeDataMap.keys()) {
			const mapKey = targetId

			const directPredecessors = predecessorIdMap.get(targetId) || []
			const producers = new Set<string>()
			for (const predId of directPredecessors)
				findOriginalProducers(predId).forEach(p => producers.add(p))

			if (producers.size > 0)
				originalPredecessorIdMap.set(mapKey, Array.from(producers))
		}

		return { predecessorIdMap, originalPredecessorIdMap }
	}

	private _findBranchTerminals(branchStarts: string[], targetId: string, graph: WorkflowGraph): string[] {
		const terminals: string[] = []
		for (const start of branchStarts) {
			const queue: string[] = [start]
			const visitedInBranch = new Set<string>()

			while (queue.length > 0) {
				const currentId = queue.shift()!
				if (visitedInBranch.has(currentId))
					continue
				visitedInBranch.add(currentId)

				const successors = graph.edges.filter(e => e.source === currentId).map(e => e.target)

				if (successors.includes(targetId)) {
					if (!terminals.includes(currentId)) {
						terminals.push(currentId)
					}
				}
				else {
					for (const successorId of successors) {
						if (!visitedInBranch.has(successorId)) {
							queue.push(successorId)
						}
					}
				}
			}
		}
		return terminals
	}

	private _findConditionalConvergence(branchStarts: string[], graph: WorkflowGraph): string | undefined {
		if (branchStarts.length <= 1)
			return undefined

		const queue: string[] = [...branchStarts]
		// Map<nodeId, Set<startNodeId>>
		const visitedBy = new Map<string, Set<string>>()
		branchStarts.forEach(startId => visitedBy.set(startId, new Set([startId])))

		let head = 0
		while (head < queue.length) {
			const currentId = queue[head++]!
			const successors = graph.edges.filter(e => e.source === currentId).map(e => e.target)

			for (const successorId of successors) {
				if (!visitedBy.has(successorId))
					visitedBy.set(successorId, new Set())

				const visitorSet = visitedBy.get(successorId)!
				const startingPointsVistingThisNode = visitedBy.get(currentId)!

				for (const startNodeId of startingPointsVistingThisNode)
					visitorSet.add(startNodeId)

				// If this node has been visited by paths originating from ALL unique branches, it's the one.
				if (visitorSet.size === branchStarts.length)
					return successorId

				if (!queue.includes(successorId))
					queue.push(successorId)
			}
		}

		return undefined
	}
}

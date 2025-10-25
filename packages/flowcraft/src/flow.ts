import { isNodeClass } from './node'
import type { EdgeDefinition, NodeClass, NodeDefinition, NodeFunction, UIGraph, WorkflowBlueprint } from './types'

/**
 * Generates a deterministic hash for a function based on its source code and a unique counter.
 */
let hashCounter = 0
function _hashFunction(fn: NodeFunction<any, any, any, any, any> | NodeClass<any, any, any, any, any>): string {
	const source = fn.toString()
	let hash = 0
	for (let i = 0; i < source.length; i++) {
		const char = source.charCodeAt(i)
		hash = (hash << 5) - hash + char
		hash = hash & hash // Convert to 32-bit integer
	}
	// Add counter to ensure uniqueness even for identical functions
	return (Math.abs(hash) + hashCounter++).toString(16)
}

/**
 * A fluent API for programmatically constructing a WorkflowBlueprint.
 */
export class Flow<
	TContext extends Record<string, any> = Record<string, any>,
	TDependencies extends Record<string, any> = Record<string, any>,
> {
	private blueprint: Partial<WorkflowBlueprint>
	private functionRegistry: Map<string, NodeFunction | NodeClass>
	private loopControllerIds: Map<string, string>
	private loopDefinitions: Array<{
		id: string
		startNodeId: string
		endNodeId: string
		condition: string
	}>
	private cycleEntryPoints: Map<string, string>

	constructor(id: string) {
		this.blueprint = { id, nodes: [], edges: [] }
		this.functionRegistry = new Map()
		this.loopControllerIds = new Map()
		this.loopDefinitions = []
		this.cycleEntryPoints = new Map()
	}

	node<TInput = any, TOutput = any, TAction extends string = string>(
		id: string,
		implementation:
			| NodeFunction<TContext, TDependencies, TInput, TOutput, TAction>
			| NodeClass<TContext, TDependencies, TInput, TOutput, TAction>,
		options?: Omit<NodeDefinition, 'id' | 'uses'>,
	): this {
		let usesKey: string

		if (isNodeClass(implementation)) {
			usesKey =
				implementation.name && implementation.name !== 'BaseNode'
					? implementation.name
					: `class_${_hashFunction(implementation)}`
			this.functionRegistry.set(usesKey, implementation)
		} else {
			usesKey = `fn_${_hashFunction(implementation)}`
			this.functionRegistry.set(usesKey, implementation as unknown as NodeFunction)
		}

		const nodeDef: NodeDefinition = { id, uses: usesKey, ...options }
		this.blueprint.nodes?.push(nodeDef)
		return this
	}

	edge(source: string, target: string, options?: Omit<EdgeDefinition, 'source' | 'target'>): this {
		const edgeDef: EdgeDefinition = { source, target, ...options }
		this.blueprint.edges?.push(edgeDef)
		return this
	}

	/**
	 * Creates a batch processing pattern.
	 * It takes an input array, runs a worker node on each item in parallel, and gathers the results.
	 * This method augments the Flow's TContext with a new key for the output array.
	 *
	 * @param id The base ID for this batch operation.
	 * @param worker The node implementation to run on each item.
	 * @param options Configuration for the batch operation.
	 * @returns The Flow instance with an updated context type for chaining.
	 */
	batch<TWorkerInput, TWorkerOutput, TWorkerAction extends string, TOutputKey extends string>(
		id: string,
		worker:
			| NodeFunction<TContext, TDependencies, TWorkerInput, TWorkerOutput, TWorkerAction>
			| NodeClass<TContext, TDependencies, TWorkerInput, TWorkerOutput, TWorkerAction>,
		options: {
			/** The key in the context that holds the input array for the batch. */
			inputKey: keyof TContext
			/** The key in the context where the array of results will be stored. */
			outputKey: TOutputKey
			/** The number of items to process in each chunk to limit memory usage. */
			chunkSize?: number
		},
	): Flow<TContext & { [K in TOutputKey]: TWorkerOutput[] }, TDependencies> {
		const { inputKey, outputKey } = options
		const scatterId = `${id}_scatter`
		const gatherId = `${id}_gather`

		// register worker implementation under a unique key.
		let workerUsesKey: string
		if (isNodeClass(worker)) {
			workerUsesKey =
				worker.name && worker.name !== 'BaseNode' ? worker.name : `class_batch_worker_${_hashFunction(worker)}`
			this.functionRegistry.set(workerUsesKey, worker)
		} else {
			workerUsesKey = `fn_batch_worker_${_hashFunction(worker)}`
			this.functionRegistry.set(workerUsesKey, worker as unknown as NodeFunction)
		}

		// scatter node: takes an array and dynamically schedules worker nodes
		this.blueprint.nodes?.push({
			id: scatterId,
			uses: 'batch-scatter', // built-in
			inputs: inputKey as string,
			params: { workerUsesKey, outputKey: outputKey as string, gatherNodeId: gatherId, chunkSize: options.chunkSize },
		})

		// gather node: waits for all workers to finish and collects the results
		this.blueprint.nodes?.push({
			id: gatherId,
			uses: 'batch-gather', // built-in
			params: { outputKey, gatherNodeId: gatherId },
			config: { joinStrategy: 'all' }, // important: must wait for all scattered jobs
		})

		// edge to connect scatter and gather nodes, orchestrator will manage dynamic workers
		this.edge(scatterId, gatherId)

		return this as unknown as Flow<TContext & { [K in TOutputKey]: TWorkerOutput[] }, TDependencies>
	}

	/**
	 * Creates a wait node that pauses workflow execution for external input.
	 * @param id A unique identifier for the wait node.
	 * @param options Optional configuration for the wait node.
	 */
	wait(id: string, options?: Omit<NodeDefinition, 'id' | 'uses'>): this {
		const nodeDef: NodeDefinition = { id, uses: 'wait', ...options }
		this.blueprint.nodes?.push(nodeDef)
		return this
	}

	/**
	 * Creates a loop pattern in the workflow graph.
	 * @param id A unique identifier for the loop construct.
	 * @param options Defines the start, end, and continuation condition of the loop.
	 * @param options.startNodeId The ID of the first node inside the loop body.
	 * @param options.endNodeId The ID of the last node inside the loop body.
	 * @param options.condition An expression that, if true, causes the loop to run again.
	 */
	loop(
		id: string,
		options: {
			/** The ID of the first node inside the loop body. */
			startNodeId: string
			/** The ID of the last node inside the loop body. */
			endNodeId: string
			/** An expression that, if true, causes the loop to run again. */
			condition: string
		},
	): this {
		const { startNodeId, endNodeId, condition } = options
		const controllerId = `${id}-loop`

		this.loopControllerIds.set(id, controllerId)

		this.loopDefinitions.push({ id, startNodeId, endNodeId, condition })

		// controller node: evaluates the loop condition
		this.blueprint.nodes?.push({
			id: controllerId,
			uses: 'loop-controller', // built-in
			params: { condition },
			config: { joinStrategy: 'any' }, // to allow re-execution on each loop iteration
		})

		this.edge(endNodeId, controllerId)

		this.edge(controllerId, startNodeId, {
			action: 'continue',
			transform: `context.${endNodeId}`, // pass the end node's value to the start node
		})

		return this
	}

	getLoopControllerId(id: string): string {
		const controllerId = this.loopControllerIds.get(id)
		if (!controllerId) {
			throw new Error(`Loop with id '${id}' not found. Ensure you have defined it using the .loop() method.`)
		}
		return controllerId
	}

	/**
	 * Sets the preferred entry point for a cycle in non-DAG workflows.
	 * This helps remove ambiguity when the runtime needs to choose a starting node for cycles.
	 * @param nodeId The ID of the node to use as the entry point for cycles containing this node.
	 */
	setCycleEntryPoint(nodeId: string): this {
		this.cycleEntryPoints.set(nodeId, nodeId)
		return this
	}

	toBlueprint(): WorkflowBlueprint {
		if (!this.blueprint.nodes || this.blueprint.nodes.length === 0) {
			throw new Error('Cannot build a blueprint with no nodes.')
		}

		const finalEdges: EdgeDefinition[] = []
		const processedOriginalEdges = new Set<EdgeDefinition>()

		for (const loopDef of this.loopDefinitions) {
			const controllerId = this.getLoopControllerId(loopDef.id)

			const edgesToRewire =
				this.blueprint.edges?.filter((e) => e.source === loopDef.endNodeId && e.target !== controllerId) || []

			for (const edge of edgesToRewire) {
				finalEdges.push({
					...edge,
					source: controllerId,
					action: edge.action || 'break',
				})
				processedOriginalEdges.add(edge)
			}
		}

		for (const edge of this.blueprint.edges || []) {
			if (!processedOriginalEdges.has(edge)) {
				finalEdges.push(edge)
			}
		}
		this.blueprint.edges = finalEdges

		for (const loopDef of this.loopDefinitions) {
			const startNode = this.blueprint.nodes?.find((n) => n.id === loopDef.startNodeId)
			const endNode = this.blueprint.nodes?.find((n) => n.id === loopDef.endNodeId)

			if (!startNode) {
				throw new Error(`Loop '${loopDef.id}' references non-existent start node '${loopDef.startNodeId}'.`)
			}
			if (!endNode) {
				throw new Error(`Loop '${loopDef.id}' references non-existent end node '${loopDef.endNodeId}'.`)
			}

			startNode.config = { ...startNode.config, joinStrategy: 'any' }
			endNode.config = { ...endNode.config, joinStrategy: 'any' }
		}

		if (this.cycleEntryPoints.size > 0) {
			this.blueprint.metadata = {
				...this.blueprint.metadata,
				cycleEntryPoints: Array.from(this.cycleEntryPoints.keys()),
			}
		}

		return this.blueprint as WorkflowBlueprint
	}

	getFunctionRegistry() {
		return this.functionRegistry
	}

	toGraphRepresentation(): UIGraph {
		const blueprint = this.toBlueprint()
		const uiNodes: UIGraph['nodes'] = []
		const uiEdges: UIGraph['edges'] = []

		const ignoredNodeIds = new Set<string>()

		// replace loop-controllers with direct, cyclical edges
		for (const loopDef of this.loopDefinitions) {
			const controllerId = this.loopControllerIds.get(loopDef.id)
			if (!controllerId) continue

			ignoredNodeIds.add(controllerId)

			// direct edge from the end of loop to start
			uiEdges.push({
				source: loopDef.endNodeId,
				target: loopDef.startNodeId,
				data: {
					isLoopback: true,
					condition: loopDef.condition,
					label: `continue if: ${loopDef.condition}`,
				},
			})

			// re-wire any 'break' edges
			const breakEdges = blueprint.edges.filter((edge) => edge.source === controllerId && edge.action === 'break')
			for (const breakEdge of breakEdges) {
				uiEdges.push({
					...breakEdge,
					source: loopDef.endNodeId,
				})
			}
		}

		// replace scatter/gather pairs with a single representative "worker" node
		const scatterNodes = blueprint.nodes.filter((n) => n.uses === 'batch-scatter')
		for (const scatterNode of scatterNodes) {
			const gatherNodeId = scatterNode.params?.gatherNodeId
			if (!gatherNodeId) continue

			ignoredNodeIds.add(scatterNode.id)
			ignoredNodeIds.add(gatherNodeId)

			// single node to represent parallel work
			const batchId = scatterNode.id.replace('_scatter', '')
			const gatherNode = blueprint.nodes.find((n) => n.id === gatherNodeId)

			uiNodes.push({
				id: batchId,
				uses: scatterNode.params?.workerUsesKey,
				type: 'batch-worker',
				data: {
					label: `Batch: ${batchId}`,
					isBatchPlaceholder: true,
					workerUsesKey: scatterNode.params?.workerUsesKey,
					inputKey: scatterNode.inputs,
					outputKey: gatherNode?.params?.outputKey,
				},
			})

			// re-wire incoming edges
			const incomingEdges = blueprint.edges.filter((e) => e.target === scatterNode.id)
			for (const edge of incomingEdges) {
				uiEdges.push({ ...edge, target: batchId })
			}

			// re-wire outgoing edges
			const outgoingEdges = blueprint.edges.filter((e) => e.source === gatherNodeId)
			for (const edge of outgoingEdges) {
				uiEdges.push({ ...edge, source: batchId })
			}
		}

		for (const node of blueprint.nodes) {
			if (!ignoredNodeIds.has(node.id)) {
				uiNodes.push(node)
			}
		}

		for (const edge of blueprint.edges) {
			if (!ignoredNodeIds.has(edge.source) && !ignoredNodeIds.has(edge.target)) {
				const alreadyAdded = uiEdges.some(
					(e) => e.source === edge.source && e.target === edge.target && e.action === edge.action,
				)
				if (!alreadyAdded) {
					uiEdges.push(edge)
				}
			}
		}

		return { nodes: uiNodes, edges: uiEdges }
	}
}

/**
 * Helper function to create a new Flow builder instance.
 */
export function createFlow<
	TContext extends Record<string, any> = Record<string, any>,
	TDependencies extends Record<string, any> = Record<string, any>,
>(id: string): Flow<TContext, TDependencies> {
	return new Flow(id)
}

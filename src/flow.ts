import type {
	EdgeDefinition,
	NodeClass,
	NodeConfig,
	NodeDefinition,
	NodeFunction,
	NodeMap,
	TransformFunction,
	WorkflowBlueprint,
} from './types'

/**
 * A custom type guard to definitively check if an implementation is a NodeClass.
 * @param value The value to check.
 * @returns True if the value is a class with an `execute` method on its prototype.
 */
function isNodeClass(value: any): value is NodeClass {
	return typeof value === 'function' && !!value.prototype?.execute
}

/**
 * Provides a type-safe, programmatic API that produces serializable blueprints
 */
export class Flow<TContext extends Record<string, any> = Record<string, any>, TNodeMap extends NodeMap = NodeMap> {
	private blueprint: Partial<WorkflowBlueprint<TNodeMap>>
	private functionRegistry: Map<string, NodeFunction<TContext>>

	constructor(id: string, nodeMap?: TNodeMap, metadata?: WorkflowBlueprint['metadata']) {
		this.blueprint = {
			id,
			metadata,
			nodes: [],
			edges: [],
			nodeMap,
		}
		this.functionRegistry = new Map()
	}

	/**
	 * Add a node to the workflow with type-safe parameters
	 * Can be a function, class, or registered node name
	 */
	node<K extends keyof TNodeMap>(
		id: string,
		uses: K,
		params: TNodeMap[K],
		config?: NodeConfig,
	): this
	node(
		id: string,
		implementation: NodeFunction<TContext> | NodeClass | string,
		params?: Record<string, any>,
		config?: NodeConfig,
	): this
	node(
		id: string,
		implementationOrUses: NodeFunction<TContext> | NodeClass | string | keyof TNodeMap,
		paramsOrConfig?: Record<string, any> | TNodeMap[keyof TNodeMap] | NodeConfig,
		config?: NodeConfig,
	): this {
		let nodeDef: NodeDefinition<TNodeMap>

		if (typeof implementationOrUses === 'string') {
			nodeDef = {
				id,
				uses: implementationOrUses,
				params: paramsOrConfig as Record<string, any>,
				config,
			}
		}
		// 1. Use the type guard. If this is true, TypeScript *knows* it's a NodeClass.
		else if (isNodeClass(implementationOrUses)) {
			const className = implementationOrUses.name || `class_${id}_${Date.now()}`
			nodeDef = {
				id,
				uses: className,
				params: paramsOrConfig as Record<string, any>,
				config,
			}
		}
		// 2. Because the above check failed, if it's a function, TypeScript now knows
		//    it *must* be a NodeFunction, as the NodeClass possibility has been eliminated.
		else if (typeof implementationOrUses === 'function') {
			const functionKey = `function_${id}_${Date.now()}`
			this.functionRegistry.set(functionKey, implementationOrUses) // This is now 100% type-safe.
			nodeDef = {
				id,
				uses: functionKey,
				params: paramsOrConfig as Record<string, any>,
				config,
			}
		}
		else {
			throw new TypeError(`Invalid node implementation type for ${id}`)
		}

		this.blueprint.nodes!.push(nodeDef)
		return this
	}

	/**
	 * Add a sub-workflow execution node.
	 * @param id The ID for this sub-workflow node in the parent flow.
	 * @param blueprintId The ID of the blueprint to execute.
	 * @param options Mappings for passing data between the parent and sub-workflow contexts.
	 * @param options.inputs Mapping of sub-workflow input keys to parent context keys.
	 * @param options.outputs Mapping of parent context keys to sub-workflow output keys.
	 */
	subflow(
		id: string,
		blueprintId: string,
		options?: {
			inputs?: Record<string, string>
			outputs?: Record<string, string>
		},
	): this {
		this.node(id, 'subflow', {
			blueprintId,
			inputs: options?.inputs,
			outputs: options?.outputs,
		})
		return this
	}

	/**
	 * Add an edge between nodes
	 */
	edge(
		source: string,
		target: string,
		options?: {
			action?: string
			condition?: string
			transform?: string
		},
	): this {
		const edgeDef: EdgeDefinition = {
			source,
			target,
			action: options?.action,
			condition: options?.condition,
			transform: options?.transform,
		}

		this.blueprint.edges!.push(edgeDef)
		return this
	}

	/**
	 * Add multiple edges at once
	 */
	edges(...edges: Array<{
		source: string
		target: string
		action?: string
		condition?: string
		transform?: string
	}>): this {
		for (const edge of edges) {
			this.edge(edge.source, edge.target, edge)
		}
		return this
	}

	/**
	 * Defines a parallel execution block.
	 * This creates a special 'parallel-container' node. You must create edges
	 * from a predecessor node *to* this new parallel node, and from this node
	 * to a successor. The branches themselves should not be connected to the main flow.
	 * @param id The ID for the new parallel container node.
	 * @param branchEntryNodeIds An array of node IDs that represent the starting point of each parallel branch.
	 * @param config Optional resiliency configuration for the container itself.
	 */
	parallel(
		id: string,
		branchEntryNodeIds: string[],
		config?: NodeConfig,
	): this {
		this.node(id, 'parallel-container', {
			branches: branchEntryNodeIds,
		}, config)
		return this
	}

	/**
	 * Create a batch processing pattern
	 */
	batch(
		source: string,
		target: string,
		worker: NodeFunction<TContext> | NodeClass | string,
		options?: {
			batchSize?: number
			concurrency?: number
			timeout?: number
		},
	): this {
		const workerKey = `batch_worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
		if (typeof worker === 'function' && !isNodeClass(worker)) {
			this.functionRegistry.set(workerKey, worker)
		}
		const batchNodeId = `batch_${Date.now()}`
		this.node(batchNodeId, 'batch-processor', {
			workerImplementationKey: workerKey,
			batchSize: options?.batchSize || 10,
			concurrency: options?.concurrency || 1,
			timeout: options?.timeout,
		})

		this.edge(source, batchNodeId)
		this.edge(batchNodeId, target)

		return this
	}

	/**
	 * Create a conditional branch pattern
	 */
	condition(
		source: string,
		conditions: Array<{
			condition: string
			target: string
			action?: string
		}>,
		defaultTarget?: string,
	): this {
		for (const cond of conditions) {
			this.edge(source, cond.target, {
				condition: cond.condition,
				action: cond.action,
			})
		}

		if (defaultTarget) {
			this.edge(source, defaultTarget)
		}

		return this
	}

	/**
	 * Create a loop pattern
	 */
	loop(
		source: string,
		target: string,
		options?: {
			maxIterations?: number
			condition?: string
			timeout?: number
		},
	): this {
		const loopNodeId = `loop_${Date.now()}`
		this.node(loopNodeId, 'loop-controller', {
			maxIterations: options?.maxIterations || 100,
			condition: options?.condition,
			timeout: options?.timeout,
		}, { joinStrategy: 'any' })

		this.edge(source, loopNodeId)
		this.edge(loopNodeId, target, { action: 'continue' })
		this.edge(loopNodeId, target, { action: 'break' })

		return this
	}

	/**
	 * Create a chain of anonymous transformation nodes between source and target
	 */
	transform<TInput = any>(
		sourceNodeId: string,
		targetNodeId: string,
		transforms: TransformFunction<TInput>[],
	): this {
		if (transforms.length === 0) {
			// If no transforms, just add a direct edge
			this.edge(sourceNodeId, targetNodeId)
			return this
		}

		// Generate unique node IDs for all transform nodes
		const transformNodeIds = transforms.map((_, i) => `${sourceNodeId}_transform_${i}_${Date.now()}`)

		// Create nodes and edges
		for (let i = 0; i < transforms.length; i++) {
			const transformNodeId = transformNodeIds[i]
			let transformFunction: NodeFunction<TContext>

			// Check if this is a filter
			let isFilter = false
			try {
				const testInput = { test: true } as any
				const testResult = transforms[i](testInput)
				isFilter = typeof testResult === 'boolean'
			}
			catch {
				// If the transform throws during filter check, assume it's not a filter
				isFilter = false
			}

			if (isFilter) {
				transformFunction = async (context) => {
					const input = context.input
					const filterResult = transforms[i](input)
					if (filterResult) {
						return { output: input }
					}
					else {
						return { output: undefined }
					}
				}
			}
			else {
				transformFunction = async (context) => {
					const input = context.input
					const result = transforms[i](input)
					return { output: result }
				}
			}

			// Register the function and create the node
			const functionKey = `transform_${transformNodeId}`
			this.functionRegistry.set(functionKey, transformFunction)
			this.node(transformNodeId, functionKey)

			// Add edge from previous to current only for the first node
			if (i === 0) {
				this.edge(sourceNodeId, transformNodeId)
			}

			// Add edge from current to next with condition if filter
			const nextNodeId = i === transforms.length - 1 ? targetNodeId : transformNodeIds[i + 1]
			if (isFilter) {
				this.edge(transformNodeId, nextNodeId, { condition: 'result !== undefined' })
			}
			else {
				this.edge(transformNodeId, nextNodeId)
			}
		}

		return this
	}

	/**
	 * Set input schema for the workflow
	 */
	inputs(schema: Record<string, any>): this {
		this.blueprint.inputs = schema
		return this
	}

	/**
	 * Set output schema for the workflow
	 */
	outputs(schema: Record<string, any>): this {
		this.blueprint.outputs = schema
		return this
	}

	/**
	 * Set metadata for the workflow
	 */
	metadata(metadata: Partial<WorkflowBlueprint['metadata']>): this {
		if (!this.blueprint.metadata) {
			this.blueprint.metadata = {}
		}
		Object.assign(this.blueprint.metadata, metadata)
		return this
	}

	/**
	 * Validate the blueprint and return it
	 */
	toBlueprint(): WorkflowBlueprint {
		if (!this.blueprint.id)
			throw new Error('Workflow must have an ID')

		if (!this.blueprint.nodes || this.blueprint.nodes.length === 0)
			throw new Error('Workflow must have at least one node')

		const nodeIds = new Set(this.blueprint.nodes!.map(n => n.id))
		for (const edge of this.blueprint.edges!) {
			if (!nodeIds.has(edge.source))
				throw new Error(`Source node '${edge.source}' not found`)
			if (!nodeIds.has(edge.target))
				throw new Error(`Target node '${edge.target}' not found`)
		}

		return this.blueprint as WorkflowBlueprint
	}

	/**
	 * Get the function registry (for runtime use)
	 */
	getFunctionRegistry(): Map<string, NodeFunction<any>> {
		return new Map(this.functionRegistry)
	}

	/**
	 * Create a copy of this flow
	 */
	clone(newId?: string): Flow<TContext, TNodeMap> {
		const cloned = new Flow<TContext, TNodeMap>(newId || `${this.blueprint.id}_clone`, this.blueprint.nodeMap)
		cloned.blueprint = JSON.parse(JSON.stringify(this.blueprint))
		cloned.blueprint.id = newId || `${this.blueprint.id}_clone`
		cloned.functionRegistry = new Map(this.functionRegistry)
		return cloned
	}

	/**
	 * Merge another flow into this one
	 */
	merge(other: Flow<TContext, TNodeMap>, prefix?: string): this {
		const otherBlueprint = other.toBlueprint()

		// add prefix to node IDs if specified
		const nodeIdMap = new Map<string, string>()
		for (const node of otherBlueprint.nodes) {
			const newId = prefix ? `${prefix}_${node.id}` : node.id
			nodeIdMap.set(node.id, newId)

			const newNode: NodeDefinition<TNodeMap> = {
				...node,
				id: newId,
			}
			this.blueprint.nodes!.push(newNode)
		}

		// update edge references
		for (const edge of otherBlueprint.edges) {
			const newEdge: EdgeDefinition = {
				source: nodeIdMap.get(edge.source) || edge.source,
				target: nodeIdMap.get(edge.target) || edge.target,
				action: edge.action,
				condition: edge.condition,
				transform: edge.transform,
			}
			this.blueprint.edges!.push(newEdge)
		}

		// merge function registry
		for (const [key, fn] of other.getFunctionRegistry()) {
			this.functionRegistry.set(key, fn)
		}

		return this
	}
}

/**
 * Create a new flow builder
 */
export function createFlow<TContext extends Record<string, any> = Record<string, any>, TNodeMap extends NodeMap = NodeMap>(
	id: string,
	nodeMap?: TNodeMap,
	metadata?: WorkflowBlueprint['metadata'],
): Flow<TContext, TNodeMap> {
	return new Flow(id, nodeMap, metadata)
}

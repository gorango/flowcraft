import type {
	EdgeDefinition,
	NodeClass,
	NodeConfig,
	NodeDefinition,
	NodeFunction,
	WorkflowBlueprint,
} from './types.js'

/**
 * Provides a type-safe, programmatic API that produces serializable blueprints
 */
export class Flow<TContext extends Record<string, any> = Record<string, any>> {
	private blueprint: Partial<WorkflowBlueprint>
	private functionRegistry: Map<string, NodeFunction>

	constructor(id: string, metadata?: WorkflowBlueprint['metadata']) {
		this.blueprint = {
			id,
			metadata,
			nodes: [],
			edges: [],
		}
		this.functionRegistry = new Map()
	}

	/**
	 * Add a node to the workflow
	 * Can be a function, class, or registered node name
	 */
	node(
		id: string,
		implementation: NodeFunction | NodeClass | string,
		params?: Record<string, any>,
		config?: NodeConfig,
	): this {
		let nodeDef: NodeDefinition

		if (typeof implementation === 'string') {
			// Reference to a registered node
			nodeDef = {
				id,
				uses: implementation,
				params,
				config,
			}
		}
		else if (typeof implementation === 'function' && implementation.prototype?.execute) {
			// Class-based node
			const className = implementation.name || `class_${id}_${Date.now()}`
			nodeDef = {
				id,
				uses: className,
				params,
				config,
			}
		}
		else if (typeof implementation === 'function') {
			// Inline function - store in private registry
			const functionKey = `function_${id}_${Date.now()}`
			this.functionRegistry.set(functionKey, implementation as NodeFunction)

			nodeDef = {
				id,
				uses: functionKey,
				params,
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
	 * Create a conditional branch
	 */
	conditional(
		source: string,
		branches: Array<{
			action: string
			target: string
			condition?: string
		}>,
	): this {
		for (const branch of branches) {
			this.edge(source, branch.target, {
				action: branch.action,
				condition: branch.condition,
			})
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
		options?: {
			batchSize?: number
			concurrency?: number
			timeout?: number
		},
	): this {
		const batchNodeId = `batch_${Date.now()}`
		this.node(batchNodeId, 'batch-processor', {
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
		})

		this.edge(source, loopNodeId)
		this.edge(loopNodeId, target, { action: 'continue' })
		this.edge(loopNodeId, target, { action: 'break' })

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
		if (!this.blueprint.id) {
			throw new Error('Workflow must have an ID')
		}

		if (!this.blueprint.nodes || this.blueprint.nodes.length === 0) {
			throw new Error('Workflow must have at least one node')
		}

		// Validate that all referenced nodes exist
		const nodeIds = new Set(this.blueprint.nodes!.map(n => n.id))
		for (const edge of this.blueprint.edges!) {
			if (!nodeIds.has(edge.source)) {
				throw new Error(`Source node '${edge.source}' not found`)
			}
			if (!nodeIds.has(edge.target)) {
				throw new Error(`Target node '${edge.target}' not found`)
			}
		}

		return this.blueprint as WorkflowBlueprint
	}

	/**
	 * Get the function registry (for runtime use)
	 */
	getFunctionRegistry(): Map<string, NodeFunction> {
		return new Map(this.functionRegistry)
	}

	/**
	 * Create a copy of this flow
	 */
	clone(newId?: string): Flow<TContext> {
		const cloned = new Flow<TContext>(newId || `${this.blueprint.id}_clone`)
		cloned.blueprint = JSON.parse(JSON.stringify(this.blueprint))
		cloned.blueprint.id = newId || `${this.blueprint.id}_clone`
		cloned.functionRegistry = new Map(this.functionRegistry)
		return cloned
	}

	/**
	 * Merge another flow into this one
	 */
	merge(other: Flow<TContext>, prefix?: string): this {
		const otherBlueprint = other.toBlueprint()

		// Add prefix to node IDs if specified
		const nodeIdMap = new Map<string, string>()
		for (const node of otherBlueprint.nodes) {
			const newId = prefix ? `${prefix}_${node.id}` : node.id
			nodeIdMap.set(node.id, newId)

			const newNode: NodeDefinition = {
				...node,
				id: newId,
			}
			this.blueprint.nodes!.push(newNode)
		}

		// Update edge references
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

		// Merge function registry
		for (const [key, fn] of other.getFunctionRegistry()) {
			this.functionRegistry.set(key, fn)
		}

		return this
	}
}

/**
 * Create a new flow builder
 */
export function createFlow<TContext extends Record<string, any> = Record<string, any>>(
	id: string,
	metadata?: WorkflowBlueprint['metadata'],
): Flow<TContext> {
	return new Flow(id, metadata)
}

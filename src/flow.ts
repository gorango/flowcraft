import type { EdgeDefinition, NodeClass, NodeDefinition, NodeFunction, WorkflowBlueprint } from './types'

/** A type guard to reliably distinguish a NodeClass from a NodeFunction. */
function isNodeClass(impl: any): impl is NodeClass {
	return typeof impl === 'function' && !!impl.prototype?.exec
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

	constructor(id: string) {
		this.blueprint = { id, nodes: [], edges: [] }
		this.functionRegistry = new Map()
	}

	node(
		id: string,
		implementation: NodeFunction<TContext, TDependencies> | NodeClass,
		params?: Record<string, any>,
	): this {
		let usesKey: string

		if (isNodeClass(implementation)) {
			usesKey = (implementation.name && implementation.name !== 'BaseNode')
				? implementation.name
				: `class_${globalThis.crypto.randomUUID()}`
			this.functionRegistry.set(usesKey, implementation)
		}
		else {
			usesKey = `fn_${globalThis.crypto.randomUUID()}`
			this.functionRegistry.set(usesKey, implementation as NodeFunction)
		}

		const nodeDef: NodeDefinition = { id, uses: usesKey, params }
		this.blueprint.nodes!.push(nodeDef)
		return this
	}

	edge(source: string, target: string, options?: Omit<EdgeDefinition, 'source' | 'target'>): this {
		const edgeDef: EdgeDefinition = { source, target, ...options }
		this.blueprint.edges!.push(edgeDef)
		return this
	}

	/**
	 * Creates a batch processing pattern.
	 * It takes an input array, runs a worker node on each item in parallel, and gathers the results.
	 * @param id The base ID for this batch operation.
	 * @param worker The node implementation to run on each item.
	 * @param options Configuration for the batch operation.
	 * @returns The Flow instance for chaining.
	 */
	batch(id: string, worker: NodeFunction<TContext, TDependencies> | NodeClass, options?: {
		/** The key in the context that holds the input array for the batch. */
		inputKey: string
		/** The key in the context where the array of results will be stored. */
		outputKey: string
	}): this {
		const { inputKey, outputKey } = options ?? { inputKey: `${id}_input`, outputKey: `${id}_output` }

		const scatterId = `${id}_scatter`
		const workerId = `${id}_worker`
		const gatherId = `${id}_gather`

		// 1. Scatter Node: A built-in node that takes an array and prepares the batch operation.
		this.node(scatterId, () => Promise.resolve({}), {
			uses: 'batch-scatter', // This is a special, built-in node type
			params: { inputKey, workerId, outputKey },
		})

		// 2. Worker Node: The user-provided logic that will be dynamically executed for each item.
		this.node(workerId, worker)

		// 3. Gather Node: A built-in node that waits for all workers to finish and collects the results.
		this.node(gatherId, () => Promise.resolve({}), {
			uses: 'batch-gather', // This is a special, built-in node type
			params: { outputKey },
			config: { joinStrategy: 'all' }, // Important: Must wait for all scattered jobs
		})

		return this
	}

	loop(startNode: string, endNode: string, options?: any): this {
		// TODO: Implement logic to generate a 'loop-controller' node and edges.
		console.warn('`.loop()` is not yet implemented.')
		return this
	}

	toBlueprint(): WorkflowBlueprint {
		if (!this.blueprint.nodes || this.blueprint.nodes.length === 0) {
			throw new Error('Cannot build a blueprint with no nodes.')
		}
		return this.blueprint as WorkflowBlueprint
	}

	getFunctionRegistry() {
		return this.functionRegistry
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

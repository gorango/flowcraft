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
	 * @param options.inputKey The key in the context that holds the input array for the batch.
	 * @param options.outputKey The key in the context where the array of results will be stored.
	 * @returns The Flow instance for chaining.
	 */
	batch(id: string, worker: NodeFunction<TContext, TDependencies> | NodeClass, options: {
		/** The key in the context that holds the input array for the batch. */
		inputKey: string
		/** The key in the context where the array of results will be stored. */
		outputKey: string
	}): this {
		const { inputKey, outputKey } = options
		const scatterId = `${id}_scatter`
		const gatherId = `${id}_gather`

		// Register the user's worker implementation under a unique key.
		let workerUsesKey: string
		if (isNodeClass(worker)) {
			workerUsesKey = (worker.name && worker.name !== 'BaseNode') ? worker.name : `class_batch_worker_${globalThis.crypto.randomUUID()}`
			this.functionRegistry.set(workerUsesKey, worker)
		}
		else {
			workerUsesKey = `fn_batch_worker_${globalThis.crypto.randomUUID()}`
			this.functionRegistry.set(workerUsesKey, worker as NodeFunction)
		}

		// Scatter Node: A built-in node that takes an array and dynamically schedules worker nodes.
		this.blueprint.nodes!.push({
			id: scatterId,
			uses: 'batch-scatter', // This is a special, built-in node type
			inputs: inputKey,
			params: { workerUsesKey, outputKey, gatherNodeId: gatherId },
		})

		// Gather Node: A built-in node that waits for all workers to finish and collects the results.
		this.blueprint.nodes!.push({
			id: gatherId,
			uses: 'batch-gather', // built-in node type
			params: { outputKey },
			config: { joinStrategy: 'all' }, // Important: Must wait for all scattered jobs
		})

		// Edge to connect the scatter and gather nodes. The orchestrator will manage the dynamic workers.
		this.edge(scatterId, gatherId)

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
	loop(id: string, options: {
		/** The ID of the first node inside the loop body. */
		startNodeId: string
		/** The ID of the last node inside the loop body. */
		endNodeId: string
		/** An expression that, if true, causes the loop to run again. */
		condition: string
	}): this {
		const { startNodeId, endNodeId, condition } = options
		const controllerId = `${id}_loop_controller`

		// Add the controller node, which evaluates the loop condition.
		this.blueprint.nodes!.push({
			id: controllerId,
			uses: 'loop-controller', // Special built-in node type
			params: { condition },
		})

		// Connect the end of the loop body to the controller.
		this.edge(endNodeId, controllerId)

		// Connect the controller back to the start of the loop if the condition is met.
		this.edge(controllerId, startNodeId, { action: 'continue' })

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

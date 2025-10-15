import { isNodeClass } from './node'
import type { EdgeDefinition, NodeClass, NodeDefinition, NodeFunction, WorkflowBlueprint } from './types'

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
	}>

	constructor(id: string) {
		this.blueprint = { id, nodes: [], edges: [] }
		this.functionRegistry = new Map()
		this.loopControllerIds = new Map()
		this.loopDefinitions = []
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
					: `class_${globalThis.crypto.randomUUID()}`
			this.functionRegistry.set(usesKey, implementation)
		} else {
			usesKey = `fn_${globalThis.crypto.randomUUID()}`
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
	 * @param id The base ID for this batch operation.
	 * @param worker The node implementation to run on each item.
	 * @param options Configuration for the batch operation.
	 * @param options.inputKey The key in the context that holds the input array for the batch.
	 * @param options.outputKey The key in the context where the array of results will be stored.
	 * @returns The Flow instance for chaining.
	 */
	batch<TInput = any, TOutput = any, TAction extends string = string>(
		id: string,
		worker:
			| NodeFunction<TContext, TDependencies, TInput, TOutput, TAction>
			| NodeClass<TContext, TDependencies, TInput, TOutput, TAction>,
		options: {
			/** The key in the context that holds the input array for the batch. */
			inputKey: string
			/** The key in the context where the array of results will be stored. */
			outputKey: string
		},
	): this {
		const { inputKey, outputKey } = options
		const scatterId = `${id}_scatter`
		const gatherId = `${id}_gather`

		// register worker implementation under a unique key.
		let workerUsesKey: string
		if (isNodeClass(worker)) {
			workerUsesKey =
				worker.name && worker.name !== 'BaseNode' ? worker.name : `class_batch_worker_${globalThis.crypto.randomUUID()}`
			this.functionRegistry.set(workerUsesKey, worker)
		} else {
			workerUsesKey = `fn_batch_worker_${globalThis.crypto.randomUUID()}`
			this.functionRegistry.set(workerUsesKey, worker as unknown as NodeFunction)
		}

		// scatter node: takes an array and dynamically schedules worker nodes
		this.blueprint.nodes?.push({
			id: scatterId,
			uses: 'batch-scatter', // built-in
			inputs: inputKey,
			params: { workerUsesKey, outputKey, gatherNodeId: gatherId },
		})

		// gather node: waits for all workers to finish and collects the results
		this.blueprint.nodes?.push({
			id: gatherId,
			uses: 'batch-gather', // built-in
			params: { outputKey },
			config: { joinStrategy: 'all' }, // important: must wait for all scattered jobs
		})

		// edge to connect scatter and gather nodes. orchestrator will manage dynamic workers
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

		this.loopDefinitions.push({ id, startNodeId, endNodeId })

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

	toBlueprint(): WorkflowBlueprint {
		if (!this.blueprint.nodes || this.blueprint.nodes.length === 0) {
			throw new Error('Cannot build a blueprint with no nodes.')
		}

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

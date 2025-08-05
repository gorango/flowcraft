import type { NodeFunction } from '../functions'
import type { NodeArgs } from '../types'
import type { AbstractNode } from '../workflow'
import type { GraphBuilder } from './graph'
import type { WorkflowGraph } from './graph.types'
import { AbortError } from '../errors'
import { DEFAULT_ACTION } from '../types'
import { Flow, Node } from '../workflow'

/**
 * An internal node used by the SubWorkflowFlow to handle the `inputs` mapping
 * of an inlined sub-workflow. It copies data from the parent context scope
 * to the sub-workflow's context scope.
 * @internal
 */
class InputMappingNode extends Node {
	private mappings: Record<string, string>
	constructor(options: { data: Record<string, string> }) {
		super()
		this.mappings = options.data
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
 * An internal node used by the SubWorkflowFlow to handle the `outputs` mapping
 * of an inlined sub-workflow. It copies data from the sub-workflow's
 * context scope back to the parent's context scope.
 * @internal
 */
class OutputMappingNode extends Node {
	private mappings: Record<string, string>
	constructor(options: { data: Record<string, string> }) {
		super()
		this.mappings = options.data
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
 * A special Flow that encapsulates a sub-workflow, including its
 * input and output data mappings, hiding the implementation details from the executor.
 * @internal
 */
export class SubWorkflowFlow extends Flow {
	constructor(
		subGraph: WorkflowGraph,
		inputs: Record<string, string>,
		outputs: Record<string, string>,
		builder: GraphBuilder<any, any>,
	) {
		super()

		const inputMapper = new InputMappingNode({ data: inputs }).withId('__sub_input_mapper')
		const outputMapper = new OutputMappingNode({ data: outputs }).withId('__sub_output_mapper')

		// Use the provided builder to construct the core part of the sub-workflow.
		const buildResult = builder.build(subGraph)

		// The entry point to this encapsulated flow is the input mapper.
		this.startNode = inputMapper

		// Wire the input mapper to the start of the actual sub-workflow logic.
		inputMapper.next(buildResult.flow)

		// Find all terminal nodes in the sub-graph and connect them to the output mapper.
		// A terminal node is one with no successors within the sub-graph's logical definition.
		// Note: The `buildResult.flow` itself can be a terminal node (e.g., for an empty sub-graph).
		if (buildResult.flow.successors.size === 0)
			buildResult.flow.next(outputMapper)

		for (const node of buildResult.nodeMap.values()) {
			// Don't double-wire the flow itself if it was already handled
			if (node.successors.size === 0 && node !== buildResult.flow)
				node.next(outputMapper)
		}
	}
}

/**
 * A `Flow` that creates a linear workflow from a sequence of nodes,
 * automatically chaining them in order.
 */
export class SequenceFlow<PrepRes = any, ExecRes = any> extends Flow<PrepRes, ExecRes> {
	/**
	 * @param nodes A sequence of `Node` or `Flow` instances to be executed in order.
	 */
	constructor(...nodes: AbstractNode[]) {
		if (nodes.length === 0) {
			super()
			return
		}
		super(nodes[0])
		let current = nodes[0]
		for (let i = 1; i < nodes.length; i++)
			current = current.next(nodes[i])
	}
}

/**
 * A `Flow` that executes a collection of different nodes concurrently.
 * This is the core of the "fan-out, fan-in" pattern for structural parallelism.
 * After all parallel branches complete, the flow can proceed to a single successor.
 */
export class ParallelFlow extends Flow<any, void> {
	/**
	 * @param nodesToRun The array of nodes to execute concurrently.
	 */
	constructor(protected nodesToRun: AbstractNode[]) {
		super()
	}

	/**
	 * A public getter to safely access the parallel branches.
	 * This is used by distributed orchestrators to know which jobs to enqueue.
	 */
	public get branches(): readonly AbstractNode[] {
		return this.nodesToRun
	}

	/**
	 * Orchestrates the parallel execution of all nodes.
	 * @internal
	 */
	async exec({ ctx, params, signal, logger, executor }: NodeArgs): Promise<void> {
		if (this.nodesToRun.length === 0) {
			logger.debug('[ParallelFlow] No branches to execute in parallel.')
			return
		}

		// The convergence node is the designated successor of this ParallelFlow. The GraphBuilder wires this.
		const convergenceNode = this.successors.get(DEFAULT_ACTION)
		const visitedInParallel = new Set<AbstractNode>()

		const runBranch = async (startNode: AbstractNode) => {
			let currentNode: AbstractNode | undefined = startNode

			while (currentNode && currentNode !== convergenceNode) {
				if (signal?.aborted)
					throw new AbortError()

				if (visitedInParallel.has(currentNode))
					break

				visitedInParallel.add(currentNode)

				const action = await currentNode._run({
					ctx,
					params: { ...params, ...currentNode.params },
					signal,
					logger,
					executor,
				})

				currentNode = executor?.getNextNode(currentNode, action)
			}
		}

		const promises = this.nodesToRun.map(runBranch)
		const results = await Promise.allSettled(promises)

		results.forEach((result) => {
			if (result.status === 'rejected')
				logger.error('[ParallelFlow] A parallel branch failed.', { error: result.reason })
		})
	}
}

/**
 * An abstract `Flow` that processes a collection of items sequentially, one by one.
 * Subclasses must implement the `prep` method to provide the items and the
 * `nodeToRun` property to define the processing logic for each item.
 */
export abstract class BatchFlow<T = any> extends Flow<Iterable<T>, null> {
	/**
	 * The `Node` instance that will be executed for each item in the batch.
	 * This must be implemented by any subclass.
	 */
	protected abstract nodeToRun: AbstractNode

	constructor() {
		super()
	}

	/**
	 * (Abstract) Prepares the list of items to be processed.
	 * This method is called once before the batch processing begins.
	 * @param _args The arguments for the node, including `ctx` and `params`.
	 * @returns An array or iterable of parameter objects, one for each item.
	 * The `nodeToRun` will be executed once for each of these objects.
	 */
	async prep(_args: NodeArgs): Promise<Iterable<any>> {
		return []
	}

	/**
	 * Orchestrates the sequential execution of `nodeToRun` for each item.
	 * @internal
	 */
	async exec(args: NodeArgs): Promise<null> {
		if (!this.nodeToRun)
			return null

		const combinedParams = { ...this.params, ...args.params }
		const batchParamsIterable = (await this.prep(args)) || []
		const batchParamsList = Array.from(batchParamsIterable)

		for (const batchParams of batchParamsList) {
			if (args.signal?.aborted)
				throw new AbortError()

			await this.nodeToRun._run({
				ctx: args.ctx,
				params: { ...combinedParams, ...batchParams },
				signal: args.signal,
				logger: args.logger,
				executor: args.executor,
			})
		}
		return null
	}
}

/**
 * An abstract `Flow` that processes a collection of items concurrently.
 * Subclasses must implement the `prep` method to provide the items and the
 * `nodeToRun` property to define the processing logic for each item.
 * This provides a significant performance boost for I/O-bound tasks.
 */
export abstract class ParallelBatchFlow<T = any> extends Flow<Iterable<T>, PromiseSettledResult<any>[]> {
	/**
	 * The `Node` instance that will be executed concurrently for each item in the batch.
	 * This must be implemented by any subclass.
	 */
	protected abstract nodeToRun: AbstractNode

	constructor() {
		super()
	}

	/**
	 * (Abstract) Prepares the list of items to be processed.
	 * This method is called once before the batch processing begins.
	 * @param _args The arguments for the node, including `ctx` and `params`.
	 * @returns An array or iterable of parameter objects, one for each item.
	 * The `nodeToRun` will be executed concurrently for each of these objects.
	 */
	async prep(_args: NodeArgs): Promise<Iterable<any>> {
		return []
	}

	/**
	 * Orchestrates the parallel execution of `nodeToRun` for each item.
	 * @internal
	 */
	async exec(args: NodeArgs<any, void>): Promise<PromiseSettledResult<any>[]> {
		if (!this.nodeToRun)
			return []

		const combinedParams = { ...this.params, ...args.params }
		const batchParamsIterable = (await this.prep(args)) || []
		const batchParamsList = Array.from(batchParamsIterable)

		const promises = batchParamsList.map((batchParams) => {
			return this.nodeToRun._run({
				ctx: args.ctx,
				params: { ...combinedParams, ...batchParams },
				signal: args.signal,
				logger: args.logger,
				executor: args.executor,
			})
		})

		const results = await Promise.allSettled(promises)

		for (const result of results) {
			if (result.status === 'rejected') {
				args.logger.error('A parallel batch item failed.', { error: result.reason })
			}
		}

		return results
	}
}

/**
 * Creates a flow that applies a mapping function to each item in a collection in parallel
 * and returns a new array containing the results.
 *
 * @example
 * const numbers = [1, 2, 3];
 * const double = (n: number) => n * 2;
 * const processingFlow = mapCollection(numbers, double);
 * // When run, processingFlow's result will be [2, 4, 6]
 *
 * @param items The initial array of items of type `T`.
 * @param fn An async or sync function that transforms an item from type `T` to type `U`.
 * @returns A `Flow` instance that, when run, will output an array of type `U[]`.
 */
export function mapCollection<T, U>(items: T[], fn: NodeFunction<T, U>): Flow<void, U[]> {
	return new class extends Flow {
		async exec(): Promise<U[]> {
			const promises = items.map(item => fn(item))
			return Promise.all(promises)
		}
	}()
}

/**
 * Creates a flow that filters a collection based on a predicate function,
 * returning a new array containing only the items that pass the predicate.
 * The predicate is applied to all items concurrently.
 *
 * @example
 * const users = [{ id: 1, admin: true }, { id: 2, admin: false }];
 * const isAdmin = async (user: { admin: boolean }) => user.admin;
 * const adminFilterFlow = filterCollection(users, isAdmin);
 * // When run, the result will be [{ id: 1, admin: true }]
 *
 * @param items The initial array of items of type `T`.
 * @param predicate An async or sync function that returns `true` or `false` for an item.
 * @returns A `Flow` instance that, when run, will output a filtered array of type `T[]`.
 */
export function filterCollection<T>(items: T[], predicate: (item: T) => boolean | Promise<boolean>): Flow<void, T[]> {
	return new class extends Flow {
		async exec(): Promise<T[]> {
			const results = await Promise.all(items.map(item => predicate(item)))
			return items.filter((_, index) => results[index])
		}
	}()
}

/**
 * Creates a flow that reduces a collection to a single value by executing a
 * reducer function sequentially for each item, similar to `Array.prototype.reduce()`.
 *
 * @example
 * const numbers = [1, 2, 3, 4];
 * const sumReducer = (acc: number, val: number) => acc + val;
 * const sumFlow = reduceCollection(numbers, sumReducer, 0);
 * // When run, the result will be 10.
 *
 * @param items The array of items to be reduced.
 * @param reducer An async or sync function that processes the accumulator and the current item.
 * @param initialValue The initial value for the accumulator.
 * @returns A `Flow` instance that, when run, will output the final accumulated value of type `U`.
 */
export function reduceCollection<T, U>(
	items: T[],
	reducer: (accumulator: U, item: T) => U | Promise<U>,
	initialValue: U,
): Flow<void, U> {
	return new class extends Flow {
		async exec(_args: NodeArgs): Promise<U> {
			let accumulator = initialValue
			for (const item of items) {
				if (_args.signal?.aborted) {
					throw new AbortError()
				}
				accumulator = await reducer(accumulator, item)
			}
			return accumulator
		}
	}()
}

import type { NodeFunction } from '../functions'
import type { AbstractNode, NodeArgs } from '../workflow'
import { AbortError, Flow } from '../workflow'

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
	 * Orchestrates the parallel execution of all nodes.
	 * @internal
	 */
	async exec({ ctx, params, signal, logger, executor }: NodeArgs): Promise<void> {
		if (this.nodesToRun.length === 0) {
			logger.info('[ParallelFlow] No branches to execute in parallel.')
			return
		}

		logger.info(`[ParallelFlow] Executing ${this.nodesToRun.length} branches in parallel...`)
		const promises = this.nodesToRun.map(node =>
			node._run({
				ctx,
				params: { ...params, ...node.params },
				signal,
				logger,
				executor,
			}),
		)
		const results = await Promise.allSettled(promises)
		logger.info(`[ParallelFlow] ✓ All parallel branches finished.`)
		// Check for and log any failures. A more robust implementation might
		// collect these errors and decide on a specific failure action.
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
		args.logger.info(`[BatchFlow] Starting sequential processing of ${batchParamsList.length} items.`)

		for (const batchParams of batchParamsList) {
			if (args.signal?.aborted)
				throw new AbortError()

			args.logger.debug(`[BatchFlow] Processing item`, { batchParams })

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
		args.logger.info(`[ParallelBatchFlow] Starting parallel processing of ${batchParamsList.length} items.`)

		const promises = batchParamsList.map((batchParams) => {
			args.logger.debug(`[ParallelBatchFlow] Processing item`, { batchParams })
			return this.nodeToRun._run({
				ctx: args.ctx,
				params: { ...combinedParams, ...batchParams },
				signal: args.signal,
				logger: args.logger,
				executor: args.executor,
			})
		})

		const results = await Promise.allSettled(promises)

		// Optionally handle rejected promises, but don't rethrow to avoid halting the whole batch.
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
			// Using Promise.all to run the mapping function on all items concurrently.
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

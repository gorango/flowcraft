import type { NodeFunction } from '../functions'
import type { AbstractNode, NodeArgs } from '../workflow'
import { AbortError, Flow } from '../workflow'

/**
 * A builder that creates a linear flow from a sequence of nodes.
 * It is the underlying implementation for `Flow.sequence()`.
 */
export class SequenceFlow extends Flow {
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
 * A flow that executes a given node sequentially for each item in a collection.
 */
export class BatchFlow extends Flow {
	constructor(protected nodeToRun: AbstractNode) {
		super()
	}

	/**
	 * Prepares the list of items to be processed.
	 * @returns An array or iterable of parameter objects, one for each item.
	 */
	async prep(_args: NodeArgs): Promise<Iterable<any>> {
		return []
	}

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
 * A flow that executes a given node in parallel for each item in a collection.
 */
export class ParallelBatchFlow extends Flow {
	constructor(protected nodeToRun: AbstractNode) {
		super()
	}

	/**
	 * Prepares the list of items to be processed.
	 * @returns An array or iterable of parameter objects, one for each item.
	 */
	async prep(_args: NodeArgs): Promise<Iterable<any>> {
		return []
	}

	async exec(args: NodeArgs<any, void>): Promise<any> {
		if (!this.nodeToRun)
			return null

		const combinedParams = { ...this.params, ...args.params }
		const batchParamsIterable = (await this.prep(args)) || []
		const batchParamsList = Array.from(batchParamsIterable)
		args.logger.info(`[ParallelBatchFlow] Starting parallel processing of ${batchParamsList.length} items.`)

		const promises = batchParamsList.map(batchParams =>
			this.nodeToRun._run({
				ctx: args.ctx,
				params: { ...combinedParams, ...batchParams },
				signal: args.signal,
				logger: args.logger,
				executor: args.executor,
			}),
		)

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
 * A builder that creates a flow from a set of nodes to be executed in parallel.
 * This is the core of the fan-out/fan-in pattern. After all parallel branches
 * have completed, the flow can proceed to a single, subsequent node.
 */
export class ParallelFlow extends Flow {
	/**
	 * @param nodesToRun The array of nodes to execute concurrently.
	 */
	constructor(protected nodesToRun: AbstractNode[]) {
		super()
	}

	async exec({ ctx, params, signal, logger, executor }: NodeArgs): Promise<void> {
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
		// use allSettled to ensure all branches complete, even if one fails.
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
 * Creates a flow that applies a mapping function to each item in a collection in parallel
 * and returns a new array containing the results.
 *
 * @example
 * const numbers = [1, 2, 3]
 * const double = (n: number) => n * 2
 * const processingFlow = mapCollection(numbers, double)
 * // When run, processingFlow's result will be [2, 4, 6]
 *
 * @param items The initial array of items of type `T`.
 * @param fn An async or sync function that transforms an item from type `T` to type `U`.
 * @returns A `Flow` instance that, when run, will output an array of type `U[]`.
 */
export function mapCollection<T, U>(items: T[], fn: NodeFunction<T, U>): Flow {
	return new class extends Flow {
		async exec(): Promise<U[]> {
			// Using Promise.all to run the mapping function on all items concurrently.
			const promises = items.map(item => fn(item))
			return Promise.all(promises)
		}
	}()
}

/**
 * Creates a flow that filters a collection based on an asynchronous predicate function,
 * returning a new array containing only the items that pass the predicate.
 *
 * @example
 * const users = [{ id: 1, admin: true }, { id: 2, admin: false }]
 * const isAdmin = async (user: { admin: boolean }) => user.admin
 * const adminFilterFlow = filterCollection(users, isAdmin)
 * // When run, the result will be [{ id: 1, admin: true }]
 *
 * @param items The initial array of items of type `T`.
 * @param predicate An async or sync function that returns `true` or `false` for an item.
 * @returns A `Flow` instance that, when run, will output a filtered array of type `T[]`.
 */
export function filterCollection<T>(items: T[], predicate: (item: T) => boolean | Promise<boolean>): Flow {
	return new class extends Flow {
		async exec(): Promise<T[]> {
			const results = await Promise.all(items.map(item => predicate(item)))
			return items.filter((_, index) => results[index])
		}
	}()
}

/**
 * Creates a flow that reduces a collection to a single value by executing a
 * reducer function for each item, similar to `Array.prototype.reduce()`.
 *
 * @example
 * const numbers = [1, 2, 3, 4]
 * const sumReducer = (acc: number, val: number) => acc + val
 * const sumFlow = reduceCollection(numbers, sumReducer, 0)
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
): Flow {
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

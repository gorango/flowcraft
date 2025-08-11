/* eslint-disable unused-imports/no-unused-vars, ts/no-this-alias */

import type { Context, ContextKey, ContextLens } from '../context'
import type { NodeArgs, NodeOptions, NodeRunContext, Params, RunOptions } from '../types'
import { AbortError, FatalWorkflowError, WorkflowError } from '../errors'
import { InMemoryExecutor } from '../executors/in-memory'
import { NullLogger } from '../logger'
import { DEFAULT_ACTION, FILTER_FAILED } from '../types'
import { sleep } from '../utils/index'
import { AbstractNode } from './AbstractNode'
import { getFlowConstructor } from './registry'

/**
 * The fundamental building block of a workflow, representing a single unit of work.
 * It features a three-phase lifecycle, retry logic, and a fluent API for creating
 * data processing pipelines.
 *
 * @template PrepRes The type of data returned by the `prep` phase.
 * @template ExecRes The type of data returned by the `exec` phase.
 * @template PostRes The type of the action returned by the `post` phase.
 * @template TParams The type for the node's static parameters.
 */
export class Node<
	PrepRes = any,
	ExecRes = any,
	PostRes = any,
	TParams extends Params = Params,
	TContext extends Context = Context,
> extends AbstractNode<PostRes, TParams, TContext> {
	/** The total number of times the `exec` phase will be attempted. */
	public maxRetries: number
	/** The time in milliseconds to wait between failed `exec` attempts. */
	public wait: number

	/**
	 * @param options Configuration options for the node's behavior.
	 * @param options.maxRetries Total number of `exec` attempts. Defaults to `1`.
	 * @param options.wait Milliseconds to wait between failed `exec` attempts. Defaults to `0`.
	 */
	constructor(options: NodeOptions = {}) {
		super()
		this.maxRetries = options.maxRetries ?? 1
		this.wait = options.wait ?? 0
	}

	protected _wrapError(e: any, phase: 'prep' | 'exec' | 'post'): Error {
		if (e instanceof AbortError || e instanceof WorkflowError)
			return e

		return new WorkflowError(`Failed in ${phase} phase for node ${this.constructor.name}`, this.constructor.name, phase, e as Error)
	}

	/**
	 * (Lifecycle) Prepares data for execution. Runs once before `exec`.
	 * This is the ideal place to read data from the `Context`.
	 * @param args The arguments for the node, including `ctx` and `params`.
	 * @returns The data required by the `exec` phase.
	 */
	async prep(args: NodeArgs<void, void, TParams, TContext>): Promise<PrepRes> { return undefined as unknown as PrepRes }

	/**
	 * (Lifecycle) Performs the core, isolated logic of the node.
	 * This is the only phase that is retried on failure. It should not access the `Context` directly.
	 * @param args The arguments for the node, including `prepRes`.
	 * @returns The result of the execution.
	 */
	async exec(args: NodeArgs<PrepRes, void, TParams, TContext>): Promise<ExecRes> { return undefined as unknown as ExecRes }

	/**
	 * (Lifecycle) Processes results and determines the next step. Runs once after `exec` succeeds.
	 * This is the ideal place to write data to the `Context`.
	 * @param args The arguments for the node, including `execRes`.
	 * @returns An "action" string to determine which successor to execute next. Defaults to `DEFAULT_ACTION`.
	 */
	async post(args: NodeArgs<PrepRes, ExecRes, TParams, TContext>): Promise<PostRes> { return DEFAULT_ACTION as any }

	/**
	 * (Lifecycle) A fallback that runs if all `exec` retries fail.
	 * If not implemented, the final error will be re-thrown, halting the workflow.
	 * @param args The arguments for the node, including the final `error` that caused the failure.
	 * @returns A fallback result of type `ExecRes`, allowing the workflow to recover and continue.
	 */
	async execFallback(args: NodeArgs<PrepRes, void, TParams, TContext>): Promise<ExecRes> {
		if (args.error)
			throw args.error

		throw new Error(`Node ${this.constructor.name} failed and has no fallback implementation.`)
	}

	/**
	 * The internal retry-aware execution logic for the `exec` phase.
	 * @internal
	 */
	async _exec(args: NodeArgs<PrepRes, void, TParams, TContext>): Promise<ExecRes> {
		let lastError: Error | undefined
		for (let curRetry = 0; curRetry < this.maxRetries; curRetry++) {
			if (args.signal?.aborted)
				throw new AbortError()
			try {
				return await this.exec(args)
			}
			catch (e) {
				const error = e as Error
				lastError = error

				if (error instanceof FatalWorkflowError)
					throw error

				if (error instanceof AbortError || error.name === 'AbortError')
					throw error

				if (curRetry < this.maxRetries - 1) {
					args.logger.warn(`Attempt ${curRetry + 1}/${this.maxRetries} failed for ${this.constructor.name}. Retrying...`, { error })
					if (this.wait > 0)
						await sleep(this.wait, args.signal)
				}
			}
		}
		args.logger.error(`All retries failed for ${this.constructor.name}. Executing fallback.`, { error: lastError })
		if (args.signal?.aborted)
			throw new AbortError()
		return await this.execFallback({ ...args, error: lastError })
	}

	/**
	 * The internal method that executes the node's full lifecycle.
	 * @internal
	 */
	async _run({ ctx, params, signal, logger, executor, visitedInParallel }: NodeRunContext<TContext>): Promise<PostRes> {
		if (signal?.aborted)
			throw new AbortError()
		let prepRes: PrepRes
		try {
			prepRes = await this.prep({ ctx: ctx as TContext, params: params as TParams, signal, logger, prepRes: undefined, execRes: undefined, executor, visitedInParallel })
		}
		catch (e) {
			throw this._wrapError(e, 'prep')
		}

		if (signal?.aborted)
			throw new AbortError()
		let execRes: ExecRes
		try {
			execRes = await this._exec({ ctx: ctx as TContext, params: params as TParams, signal, logger, prepRes, execRes: undefined, executor, visitedInParallel })
		}
		catch (e) {
			throw this._wrapError(e, 'exec')
		}

		if (signal?.aborted)
			throw new AbortError()
		try {
			const action = await this.post({ ctx: ctx as TContext, params: params as TParams, signal, logger, prepRes, execRes, executor, visitedInParallel })
			return action === undefined ? DEFAULT_ACTION as any : action
		}
		catch (e) {
			throw this._wrapError(e, 'post')
		}
	}

	/**
	 * Runs the node as a standalone unit, independent of a larger flow.
	 * This is useful for testing individual nodes in isolation.
	 *
	 * @param ctx The shared workflow context.
	 * @param options Runtime options like a logger or abort controller.
	 * @returns The result of the node's `post` method (its action).
	 */
	async run(ctx: TContext, options?: RunOptions): Promise<PostRes> {
		const Flow = getFlowConstructor()
		const logger = options?.logger ?? new NullLogger()
		if (this.successors.size > 0 && !(this instanceof Flow))
			logger.warn('Node.run() called directly on a node with successors. The flow will not continue. Use a Flow to execute a sequence.')
		const executor = options?.executor ?? new InMemoryExecutor()
		// Wrap the node in a Flow and pass its params via the options.
		return executor.run(new Flow(this), ctx, { ...options, params: this.params })
	}

	/**
	 * Creates a new node that transforms the result of this node's `exec` phase.
	 *
	 * @remarks
	 * This method returns a **new** `Node` instance and does not modify the original.
	 * The new node inherits the original's `prep` method. The original `post` method
	 * is discarded as it is incompatible with the new result type.
	 *
	 * @example
	 * const fetchUserNode = new FetchUserNode() // returns { id: 1, name: 'Alice' }
	 * const getUserNameNode = fetchUserNode.map(user => user.name) // returns 'Alice'
	 *
	 * @param fn A sync or async function to transform the execution result from `ExecRes` to `NewRes`.
	 * @returns A new `Node` instance with the transformed output type.
	 */
	map<NewRes>(fn: (result: ExecRes) => NewRes | Promise<NewRes>): Node<PrepRes, NewRes, any, TParams, TContext> {
		const originalNode = this
		const maxRetries = this.maxRetries
		const wait = this.wait

		return new class extends Node<PrepRes, NewRes, any, TParams, TContext> {
			constructor() { super({ maxRetries, wait }) }
			async prep(args: NodeArgs<void, void, TParams, TContext>): Promise<PrepRes> { return originalNode.prep(args) }
			async exec(args: NodeArgs<PrepRes, void, TParams, TContext>): Promise<NewRes> {
				const originalResult = await originalNode.exec(args)
				return fn(originalResult)
			}

			async post(_args: NodeArgs<PrepRes, NewRes, TParams, TContext>): Promise<any> {
				return DEFAULT_ACTION
			}
		}()
	}

	/**
	 * Creates a new node that stores the result of this node's `exec` phase in the `Context`.
	 * This is a common terminal operation for a data processing chain.
	 *
	 * @remarks
	 * This method returns a **new** `Node` instance and does not modify the original.
	 *
	 * @example
	 * const USER_NAME = contextKey<string>('user_name')
	 * const workflow = new FetchUserNode()
	 *   .map(user => user.name)
	 *   .toContext(USER_NAME)
	 *
	 * @param key The type-safe `ContextKey` to use for storing the result.
	 * @returns A new `Node` instance that performs the context update in its `post` phase.
	 */
	toContext(key: ContextKey<ExecRes>): Node<PrepRes, ExecRes, any, TParams, TContext> {
		const originalNode = this
		const maxRetries = this.maxRetries
		const wait = this.wait

		return new class extends Node<PrepRes, ExecRes, any, TParams, TContext> {
			constructor() { super({ maxRetries, wait }) }
			async prep(args: NodeArgs<void, void, TParams, TContext>): Promise<PrepRes> { return originalNode.prep(args) }
			async exec(args: NodeArgs<PrepRes, void, TParams, TContext>): Promise<ExecRes> { return originalNode.exec(args) }
			async post(args: NodeArgs<PrepRes, ExecRes, TParams, TContext>): Promise<any> {
				args.ctx.set(key, args.execRes)
				return DEFAULT_ACTION
			}
		}()
	}

	/**
	 * Creates a new node that acts as a conditional gate based on the `exec` result.
	 * If the predicate returns `true`, the node returns `DEFAULT_ACTION`.
	 * If it returns `false`, the node returns `FILTER_FAILED`, enabling branching.
	 *
	 * @remarks
	 * This method returns a **new** `Node` instance and does not modify the original.
	 *
	 * @example
	 * const checkAdminNode = new FetchUserNode().filter(user => user.isAdmin)
	 *
	 * checkAdminNode.next(adminOnlyNode, DEFAULT_ACTION)
	 * checkAdminNode.next(accessDeniedNode, FILTER_FAILED)
	 *
	 * @param predicate A sync or async function that returns `true` or `false`.
	 * @returns A new `Node` instance that implements the filter logic.
	 */
	filter(predicate: (result: ExecRes) => boolean | Promise<boolean>): Node<PrepRes, ExecRes, any, TParams, TContext> {
		const originalNode = this

		return new class extends Node<PrepRes, ExecRes, any, TParams, TContext> {
			private didPass = false

			async prep(args: NodeArgs<void, void, TParams, TContext>) { return originalNode.prep(args) }
			async exec(args: NodeArgs<PrepRes, void, TParams, TContext>): Promise<ExecRes> {
				const result = await originalNode.exec(args)
				this.didPass = await predicate(result)
				if (!this.didPass)
					args.logger.debug(`[Filter] Predicate failed for node ${this.constructor.name}.`)

				return result
			}

			async post(_args: NodeArgs<PrepRes, ExecRes, TParams, TContext>): Promise<any> {
				return this.didPass ? DEFAULT_ACTION : FILTER_FAILED
			}
		}()
	}

	/**
	 * Creates a new node that performs a side effect with the `exec` result,
	 * but passes the original result through unmodified. Ideal for logging or debugging.
	 *
	 * @remarks
	 * This method returns a **new** `Node` instance and does not modify the original.
	 *
	 * @example
	 * const workflow = new FetchUserNode()
	 *   .tap(user => console.log('Fetched User:', user))
	 *   .map(user => user.id)
	 *
	 * @param fn A function to call with the execution result for its side effect.
	 * @returns A new `Node` instance that wraps the original.
	 */
	tap(fn: (result: ExecRes) => void | Promise<void>): Node<PrepRes, ExecRes, PostRes, TParams, TContext> {
		const originalNode = this
		const maxRetries = this.maxRetries
		const wait = this.wait

		return new class extends Node<PrepRes, ExecRes, PostRes, TParams, TContext> {
			constructor() { super({ maxRetries, wait }) }
			async prep(args: NodeArgs<void, void, TParams, TContext>): Promise<PrepRes> {
				return originalNode.prep(args)
			}

			async exec(args: NodeArgs<PrepRes, void, TParams, TContext>): Promise<ExecRes> {
				const originalResult = await originalNode.exec(args)
				await fn(originalResult)
				return originalResult
			}

			async post(args: NodeArgs<PrepRes, ExecRes, TParams, TContext>): Promise<PostRes> {
				return originalNode.post(args)
			}
		}()
	}

	/**
	 * Creates a new node that applies a context mutation using a lens before executing.
	 * This allows for declaratively setting or updating context as part of a fluent chain.
	 *
	 * @remarks
	 * This method returns a **new** `Node` instance and does not modify the original.
	 *
	 * @example
	 * const VALUE = contextKey<number>('value')
	 * const valueLens = lens(VALUE)
	 *
	 * const nodeWithLens = new SomeNode().withLens(valueLens, 42) // Sets VALUE to 42 before SomeNode runs
	 *
	 * @param lens The `ContextLens` to use for the operation.
	 * @param value The value to set in the context via the lens.
	 * @returns A new `Node` instance that applies the context change.
	 */
	withLens<T>(lens: ContextLens<T>, value: T): Node<PrepRes, ExecRes, PostRes, TParams, TContext> {
		const originalNode = this
		const maxRetries = this.maxRetries
		const wait = this.wait

		return new class extends Node<PrepRes, ExecRes, PostRes, TParams, TContext> {
			constructor() { super({ maxRetries, wait }) }
			async prep(args: NodeArgs<void, void, TParams, TContext>): Promise<PrepRes> {
				// Apply the lens transformation before executing the original node's logic.
				await lens.set(value)(args.ctx)
				return originalNode.prep(args)
			}

			async exec(args: NodeArgs<PrepRes, void, TParams, TContext>): Promise<ExecRes> {
				return originalNode.exec(args)
			}

			async post(args: NodeArgs<PrepRes, ExecRes, TParams, TContext>): Promise<PostRes> {
				return originalNode.post(args)
			}
		}()
	}
}

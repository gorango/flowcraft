import type { Context, ContextKey, ContextLens } from './context'
import type { InternalRunOptions } from './executor'
import type { Middleware, NodeArgs, NodeOptions, NodeRunContext, Params, RunOptions } from './types'
import { AbortError, WorkflowError } from './errors'
import { InMemoryExecutor } from './executors/in-memory'
import { NullLogger } from './logger'
import { DEFAULT_ACTION, FILTER_FAILED } from './types'
import { sleep } from './utils/index'

export * from './context'
export * from './errors'
export * from './executor'
export * from './logger'
export * from './types'

export abstract class AbstractNode {
	public id?: number | string
	public params: Params = {}
	public successors = new Map<string | typeof DEFAULT_ACTION | typeof FILTER_FAILED, AbstractNode>()

	/**
	 * Sets a unique identifier for this node instance.
	 * Primarily used by the GraphBuilder.
	 * @param id The unique ID for the node.
	 * @returns The node instance for chaining.
	 */
	withId(id: number | string): this {
		this.id = id
		return this
	}

	/**
	 * Sets or merges parameters for the node.
	 * @param params The parameters to merge into the node's existing parameters.
	 * @returns The node instance for chaining.
	 */
	withParams(params: Params): this {
		this.params = { ...this.params, ...params }
		return this
	}

	/**
	 * Defines the next node in the sequence for a given action.
	 * @param node The successor node.
	 * @param action The action string that triggers the transition to this successor. Defaults to 'default'.
	 * @returns The successor node instance for chaining.
	 */
	next(node: AbstractNode, action: string | typeof DEFAULT_ACTION | typeof FILTER_FAILED = DEFAULT_ACTION): AbstractNode {
		this.successors.set(action, node)
		return node
	}

	abstract _run(ctx: NodeRunContext): Promise<any>
}

/**
 * The fundamental building block of a workflow, representing a single unit of work.
 * @template PrepRes The type of data returned by the `prep` phase.
 * @template ExecRes The type of data returned by the `exec` phase.
 * @template PostRes The type of the action returned by the `post` phase.
 */
export class Node<PrepRes = any, ExecRes = any, PostRes = any> extends AbstractNode {
	public maxRetries: number
	public wait: number

	/**
	 * @param options Configuration options for the node's behavior.
	 */
	constructor(options: NodeOptions = {}) {
		super()
		this.maxRetries = options.maxRetries ?? 1
		this.wait = options.wait ?? 0
	}

	protected _wrapError(e: any, phase: 'prep' | 'exec' | 'post'): Error {
		if (e instanceof AbortError || e instanceof WorkflowError) {
			return e
		}
		return new WorkflowError(`Failed in ${phase} phase for node ${this.constructor.name}`, this.constructor.name, phase, e as Error)
	}

	/** (Lifecycle) Prepares data for execution. Runs before `exec`. */
	async prep(_args: NodeArgs<void, void>): Promise<PrepRes> { return undefined as unknown as PrepRes }
	/** (Lifecycle) Performs the core logic of the node. */
	async exec(_args: NodeArgs<PrepRes, void>): Promise<ExecRes> { return undefined as unknown as ExecRes }
	/** (Lifecycle) Processes results and determines the next action. Runs after `exec`. */
	async post(_args: NodeArgs<PrepRes, ExecRes>): Promise<PostRes> { return DEFAULT_ACTION as any }
	/** (Lifecycle) A fallback that runs if all `exec` retries fail. */
	async execFallback(args: NodeArgs<PrepRes, void>): Promise<ExecRes> {
		if (args.error) {
			throw args.error
		}
		throw new Error(`Node ${this.constructor.name} failed and has no fallback implementation.`)
	}

	async _exec(args: NodeArgs<PrepRes, void>): Promise<ExecRes> {
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

	async _run({ ctx, params, signal, logger, executor }: NodeRunContext): Promise<PostRes> {
		if (this instanceof Flow) {
			logger.info(`Running flow: ${this.constructor.name}`, { params })
		}
		else {
			logger.info(`Running node: ${this.constructor.name}`, { params })
		}

		if (signal?.aborted)
			throw new AbortError()
		let prepRes: PrepRes
		try {
			prepRes = await this.prep({ ctx, params, signal, logger, prepRes: undefined, execRes: undefined, executor })
		}
		catch (e) {
			throw this._wrapError(e, 'prep')
		}
		if (signal?.aborted)
			throw new AbortError()
		let execRes: ExecRes
		try {
			execRes = await this._exec({ ctx, params, signal, logger, prepRes, execRes: undefined, executor })
		}
		catch (e) {
			throw this._wrapError(e, 'exec')
		}
		if (signal?.aborted)
			throw new AbortError()
		try {
			const action = await this.post({ ctx, params, signal, logger, prepRes, execRes, executor })
			return action === undefined ? DEFAULT_ACTION as any : action
		}
		catch (e) {
			throw this._wrapError(e, 'post')
		}
	}

	/**
	 * Runs the node as a standalone unit.
	 * @param ctx The shared workflow context.
	 * @param options Runtime options like a logger or abort controller.
	 * @returns The result of the node's `post` method.
	 */
	async run(ctx: Context, options?: RunOptions): Promise<PostRes> {
		const logger = options?.logger ?? new NullLogger()
		if (this.successors.size > 0 && !(this instanceof Flow))
			logger.warn('Node.run() called directly on a node with successors. The flow will not continue. Use a Flow to execute a sequence.')
		const executor = options?.executor ?? new InMemoryExecutor()
		// Wrap the node in a Flow and pass its params via the options.
		return executor.run(new Flow(this), ctx, { ...options, params: this.params })
	}

	/**
	 * Creates a new node by applying a transformation function to the result of this node's `exec` method.
	 * The new node inherits the original's `prep` method. The original `post` method is discarded
	 * as it is incompatible with the new result type.
	 *
	 * @example
	 * const fetchUserNode = new FetchUserNode();
	 * const getUserNameNode = fetchUserNode.map(user => user.name);
	 *
	 * @param fn A function to transform the execution result from `ExecRes` to `NewRes`.
	 * @returns A new `Node` instance with the transformed output type.
	 */
	map<NewRes>(fn: (result: ExecRes) => NewRes | Promise<NewRes>): Node<PrepRes, NewRes, any> {
		const originalNode = this
		const maxRetries = this.maxRetries
		const wait = this.wait

		return new class extends Node<PrepRes, NewRes, any> {
			constructor() { super({ maxRetries, wait }) }
			async prep(args: NodeArgs): Promise<PrepRes> { return originalNode.prep(args) }
			async exec(args: NodeArgs<PrepRes>): Promise<NewRes> {
				const originalResult = await originalNode.exec(args)
				return fn(originalResult)
			}

			async post(_args: NodeArgs<PrepRes, NewRes>): Promise<any> {
				return DEFAULT_ACTION
			}
		}()
	}

	/**
	 * Creates a new node that takes the result of this node's execution and sets it in the context.
	 * This is a common terminal operation for a mapping chain.
	 *
	 * @example
	 * const USER_NAME = contextKey<string>('user_name');
	 * const workflow = new FetchUserNode()
	 *   .map(user => user.name)
	 *   .toContext(USER_NAME);
	 *
	 * @param key The `ContextKey` to use for storing the result.
	 * @returns A new `Node` instance that performs the context update in its `post` phase.
	 */
	toContext(key: ContextKey<ExecRes>): Node<PrepRes, ExecRes, any> {
		const originalNode = this
		const maxRetries = this.maxRetries
		const wait = this.wait

		return new class extends Node<PrepRes, ExecRes, any> {
			constructor() { super({ maxRetries, wait }) }
			async prep(args: NodeArgs): Promise<PrepRes> { return originalNode.prep(args) }
			async exec(args: NodeArgs<PrepRes>): Promise<ExecRes> { return originalNode.exec(args as any) }
			async post(args: NodeArgs<PrepRes, ExecRes>): Promise<any> {
				args.ctx.set(key, args.execRes)
				return DEFAULT_ACTION
			}
		}()
	}

	/**
	 * Creates a new node that acts as a conditional gate. The workflow only proceeds
	 * if the predicate function returns `true`. If it returns `false`, the node
	 * returns a special `FILTER_FAILED` action, allowing for branching.
	 *
	 * @example
	 * const checkAdminNode = new FetchUserNode()
	 *   .filter(user => user.isAdmin);
	 *
	 * checkAdminNode.next(adminOnlyNode, DEFAULT_ACTION);
	 * checkAdminNode.next(accessDeniedNode, FILTER_FAILED);
	 *
	 * @param predicate A function that returns `true` or `false` based on the execution result.
	 * @returns A new `Node` instance that implements the filter logic.
	 */
	filter(predicate: (result: ExecRes) => boolean | Promise<boolean>): Node<PrepRes, ExecRes, any> {
		const originalNode = this

		return new class extends Node<PrepRes, ExecRes, any> {
			private didPass = false

			async prep(args: NodeArgs) { return originalNode.prep(args) }
			async exec(args: NodeArgs<PrepRes>): Promise<ExecRes> {
				const result = await originalNode.exec(args)
				this.didPass = await predicate(result)
				if (!this.didPass)
					args.logger.info(`[Filter] Predicate failed for node ${this.constructor.name}.`)

				return result
			}

			async post(_args: NodeArgs<PrepRes, ExecRes>): Promise<any> {
				return this.didPass ? DEFAULT_ACTION : FILTER_FAILED
			}
		}()
	}

	/**
	 * Creates a new node that performs a side effect with the result of this node's execution,
	 * but does not change the result itself. Useful for logging or debugging.
	 *
	 * @example
	 * const workflow = new FetchUserNode()
	 *   .tap(user => console.log('Fetched User:', user))
	 *   .map(user => user.id);
	 *
	 * @param fn A function to call with the execution result for its side effect.
	 * @returns A new `Node` instance that wraps the original.
	 */
	tap(fn: (result: ExecRes) => void | Promise<void>): Node<PrepRes, ExecRes, PostRes> {
		return this.map(async (result) => {
			await fn(result)
			return result
		})
	}

	/**
	 * Creates a new node that applies a context mutation using a lens before executing.
	 * This allows for functionally setting or updating context as part of a chain.
	 *
	 * @example
	 * const VALUE = contextKey<number>('value');
	 * const valueLens = lens(VALUE);
	 *
	 * const nodeWithLens = new SomeNode()
	 *   .withLens(valueLens, 42); // Sets VALUE to 42 before SomeNode runs
	 *
	 * @param lens The `ContextLens` to use for the operation.
	 * @param value The value to set in the context via the lens.
	 * @returns A new `Node` instance that applies the context change.
	 */
	withLens<T>(lens: ContextLens<T>, value: T): Node<PrepRes, ExecRes, PostRes> {
		const originalNode = this
		const maxRetries = this.maxRetries
		const wait = this.wait

		return new class extends Node<PrepRes, ExecRes, PostRes> {
			constructor() { super({ maxRetries, wait }) }
			async prep(args: NodeArgs): Promise<PrepRes> {
				// Apply the lens transformation before executing the original node's logic.
				lens.set(value)(args.ctx)
				return originalNode.prep(args)
			}

			async exec(args: NodeArgs<PrepRes>): Promise<ExecRes> {
				return originalNode.exec(args as any)
			}

			async post(args: NodeArgs<PrepRes, ExecRes>): Promise<PostRes> {
				return originalNode.post(args)
			}
		}()
	}
}

/**
 * A special node that orchestrates a sequence of other nodes.
 */
export class Flow extends Node<any, any, any> {
	public startNode?: AbstractNode
	public middleware: Middleware[] = []

	/**
	 * @param start An optional node to start the flow with.
	 */
	constructor(start?: AbstractNode) {
		super()
		this.startNode = start
	}

	protected _wrapError(e: any, phase: 'prep' | 'exec' | 'post'): Error {
		// An error during a Flow's `exec` phase is from a sub-node or middleware.
		// Do not wrap it, so the original error is preserved.
		if (phase === 'exec') {
			return e
		}
		// For other phases, use the default behavior.
		return super._wrapError(e, phase)
	}

	public use(fn: Middleware): this {
		this.middleware.push(fn)
		return this
	}

	/**
	 * Sets the starting node of the flow.
	 * @param start The node to start with.
	 * @returns The start node instance for chaining.
	 */
	start(start: AbstractNode): AbstractNode {
		this.startNode = start
		return start
	}

	/**
	 * Executes the flow's internal graph when it is used as a node
	 * within a larger flow (composition).
	 * @param args The arguments for the node.
	 * @returns The action returned by the last node in the flow.
	 */
	async exec(args: NodeArgs<any, any>): Promise<any> {
		// Guard clause for non-in-memory executors which don't support sub-flows.
		if (!(args.executor instanceof InMemoryExecutor)) {
			throw new TypeError('Sub-flow orchestration is only supported by the InMemoryExecutor.')
		}

		// Handle logic-bearing flows (like BatchFlow) by calling their own `exec`
		if (!this.startNode) {
			return super.exec(args)
		}

		args.logger.info(`-- Entering sub-flow: ${this.constructor.name} --`)

		// Combine the parent flow's params with this sub-flow's own params.
		const combinedParams = { ...args.params, ...this.params }

		const internalOptions: InternalRunOptions = {
			logger: args.logger,
			signal: args.signal,
			params: combinedParams,
			executor: args.executor,
		}

		// Delegate orchestration to the executor's stateless helper method.
		// Pass *this* flow's startNode and *this* flow's middleware.
		const finalAction = await args.executor._orch(
			this.startNode,
			this.middleware,
			args.ctx,
			internalOptions,
		)

		args.logger.info(`-- Exiting sub-flow: ${this.constructor.name} --`)
		return finalAction
	}

	async post({ execRes }: NodeArgs<any, any>): Promise<any> {
		return execRes
	}

	/**
	 * Runs the entire flow as a top-level entry point.
	 * @param ctx The shared workflow context.
	 * @param options Runtime options like a logger, abort controller, or a custom executor.
	 * @returns The action returned by the last node in the flow.
	 */
	async run(ctx: Context, options?: RunOptions): Promise<any> {
		const executor = options?.executor ?? new InMemoryExecutor()
		return executor.run(this, ctx, options)
	}
}

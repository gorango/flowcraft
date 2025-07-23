import type { Context, ContextKey, ContextLens } from './context'
import type { Logger } from './logger'
import type { Middleware, MiddlewareNext, NodeArgs, NodeOptions, Params, RunOptions } from './types'
import { AbortError, WorkflowError } from './errors'
import { NullLogger } from './logger'
import { DEFAULT_ACTION, FILTER_FAILED } from './types'
import { sleep } from './utils/index'

export * from './context'
export * from './errors'
export * from './logger'
export * from './types'

export abstract class AbstractNode {
	public params: Params = {}
	public successors = new Map<string | typeof DEFAULT_ACTION | typeof FILTER_FAILED, AbstractNode>()

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

	abstract _run(ctx: Context, params: Params, signal: AbortSignal | undefined, logger: Logger): Promise<any>
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

	/** (Lifecycle) Prepares data for execution. Runs before `exec`. */
	async prep(args: NodeArgs<void, void>): Promise<PrepRes> { return undefined as unknown as PrepRes }
	/** (Lifecycle) Performs the core logic of the node. */
	async exec(args: NodeArgs<PrepRes, void>): Promise<ExecRes> { return undefined as unknown as ExecRes }
	/** (Lifecycle) Processes results and determines the next action. Runs after `exec`. */
	async post(args: NodeArgs<PrepRes, ExecRes>): Promise<PostRes> { return DEFAULT_ACTION as any }
	/** (Lifecycle) A fallback that runs if all `exec` retries fail. */
	async execFallback(args: NodeArgs<PrepRes, void>): Promise<ExecRes> { throw args.error }

	async _exec(args: NodeArgs<PrepRes, void>): Promise<ExecRes> {
		for (let curRetry = 0; curRetry < this.maxRetries; curRetry++) {
			if (args.signal?.aborted)
				throw new AbortError()
			try {
				return await this.exec(args)
			}
			catch (e) {
				const error = e as Error
				if (error instanceof AbortError || error.name === 'AbortError')
					throw error
				if (curRetry < this.maxRetries - 1) {
					args.logger.warn(`Attempt ${curRetry + 1}/${this.maxRetries} failed for ${this.constructor.name}. Retrying...`, { error })
					if (this.wait > 0)
						await sleep(this.wait, args.signal)
				}
				else {
					args.logger.error(`All retries failed for ${this.constructor.name}. Executing fallback.`, { error })
					if (args.signal?.aborted)
						throw new AbortError()
					return await this.execFallback({ ...args, error })
				}
			}
		}
		throw new Error('Internal Error: _exec loop finished without returning or throwing.')
	}

	async _run(ctx: Context, params: Params, signal: AbortSignal | undefined, logger: Logger): Promise<PostRes> {
		logger.info(`Running node: ${this.constructor.name}`, { params })
		if (signal?.aborted)
			throw new AbortError()
		let prepRes: PrepRes
		try {
			prepRes = await this.prep({ ctx, params, signal, logger, prepRes: undefined, execRes: undefined })
		}
		catch (e) {
			if (e instanceof AbortError || e instanceof WorkflowError || this instanceof Flow)
				throw e
			throw new WorkflowError(`Failed in prep phase for node ${this.constructor.name}`, this.constructor.name, 'prep', e as Error)
		}
		if (signal?.aborted)
			throw new AbortError()
		let execRes: ExecRes
		try {
			execRes = await this._exec({ ctx, params, signal, logger, prepRes, execRes: undefined })
		}
		catch (e) {
			if (e instanceof AbortError || e instanceof WorkflowError || this instanceof Flow)
				throw e
			throw new WorkflowError(`Failed in exec phase for node ${this.constructor.name}`, this.constructor.name, 'exec', e as Error)
		}
		if (signal?.aborted)
			throw new AbortError()
		try {
			return await this.post({ ctx, params, signal, logger, prepRes, execRes })
		}
		catch (e) {
			if (e instanceof AbortError || e instanceof WorkflowError || this instanceof Flow)
				throw e
			throw new WorkflowError(`Failed in post phase for node ${this.constructor.name}`, this.constructor.name, 'post', e as Error)
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
		if (this.successors.size > 0)
			logger.warn('Node.run() called directly on a node with successors. The flow will not continue. Use a Flow to execute a sequence.')
		return this._run(ctx, this.params, options?.controller?.signal, logger)
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

			async post(args: NodeArgs<PrepRes, NewRes>): Promise<any> {
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
				if (!this.didPass) {
					args.logger.info(`[Filter] Predicate failed for node ${this.constructor.name}.`)
				}
				return result
			}

			async post(args: NodeArgs<PrepRes, ExecRes>): Promise<any> {
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
	private middleware: Middleware[] = []

	/**
	 * @param start An optional node to start the flow with.
	 */
	constructor(start?: AbstractNode) {
		super()
		this.startNode = start
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

	protected getNextNode(curr: AbstractNode, action: any, logger: Logger): AbstractNode | undefined {
		const nextNode = curr.successors.get(action)
		const actionDisplay = typeof action === 'symbol' ? 'default' : action
		if (nextNode) {
			logger.debug(`Action '${actionDisplay}' from ${curr.constructor.name} leads to ${nextNode.constructor.name}`, { action })
		}
		else if (curr.successors.size > 0 && action !== undefined) {
			logger.info(`Flow ends: Action '${actionDisplay}' from ${curr.constructor.name} has no configured successor.`)
		}
		return nextNode
	}

	protected async _orch(ctx: Context, params: Params, signal: AbortSignal | undefined, logger: Logger): Promise<any> {
		let curr = this.startNode
		let lastAction: any
		while (curr) {
			if (signal?.aborted)
				throw new AbortError()
			const nodeToRun = curr
			const runNode: MiddlewareNext = (args: NodeArgs) => {
				return nodeToRun._run(args.ctx, { ...args.params, ...nodeToRun.params }, args.signal, args.logger)
			}
			const chain = this.middleware.reduceRight<MiddlewareNext>(
				(next: MiddlewareNext, mw: Middleware): MiddlewareNext => {
					return (args: NodeArgs) => mw(args, next)
				},
				runNode,
			)
			lastAction = await chain({ ctx, params, signal, logger, prepRes: undefined, execRes: undefined, name: curr.constructor.name })
			curr = this.getNextNode(nodeToRun, lastAction, logger)
		}
		return lastAction
	}

	async exec(args: NodeArgs<any, any>): Promise<any> {
		const combinedParams = { ...this.params, ...args.params }
		return await this._orch(args.ctx, combinedParams, args.signal, args.logger)
	}

	async post({ execRes }: NodeArgs<any, any>): Promise<any> {
		return execRes
	}

	/**
	 * Runs the entire flow.
	 * @param ctx The shared workflow context.
	 * @param options Runtime options like a logger or abort controller.
	 * @returns The action returned by the last node in the flow.
	 */
	async run(ctx: Context, options?: RunOptions): Promise<any> {
		const logger = options?.logger ?? new NullLogger()
		return this._run(ctx, this.params, options?.controller?.signal, logger)
	}
}

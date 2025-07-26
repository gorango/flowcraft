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

/**
 * The abstract base class for all executable units in a workflow.
 * It provides the core structure for connecting nodes into a graph.
 */
export abstract class AbstractNode {
	/** A unique identifier for this node instance, often set by the GraphBuilder. */
	public id?: number | string
	/** A key-value store for static parameters that configure the node's behavior. */
	public params: Params = {}
	/** A map of successor nodes, keyed by the action that triggers the transition. */
	public successors = new Map<string | typeof DEFAULT_ACTION | typeof FILTER_FAILED, AbstractNode>()

	/**
	 * Sets a unique identifier for this node instance.
	 * Primarily used by the GraphBuilder for wiring and debugging.
	 * @param id The unique ID for the node.
	 * @returns The node instance for chaining.
	 */
	withId(id: number | string): this {
		this.id = id
		return this
	}

	/**
	 * Sets or merges static parameters for the node. These parameters are available
	 * via `args.params` in the node's lifecycle methods.
	 * @param params The parameters to merge into the node's existing parameters.
	 * @returns The node instance for chaining.
	 */
	withParams(params: Params): this {
		this.params = { ...this.params, ...params }
		return this
	}

	/**
	 * Defines the next node in the sequence for a given action.
	 * This is the primary method for constructing a workflow graph.
	 *
	 * @param node The successor node to execute next.
	 * @param action The action string from this node's `post` method that triggers
	 * the transition. Defaults to `DEFAULT_ACTION` for linear flows.
	 * @returns The successor node instance, allowing for further chaining.
	 */
	next(node: AbstractNode, action: string | typeof DEFAULT_ACTION | typeof FILTER_FAILED = DEFAULT_ACTION): AbstractNode {
		this.successors.set(action, node)
		return node
	}

	/**
	 * The internal method that executes the node's full lifecycle.
	 * It is called by an `IExecutor`.
	 * @internal
	 */
	abstract _run(ctx: NodeRunContext): Promise<any>
}

/**
 * The fundamental building block of a workflow, representing a single unit of work.
 * It features a three-phase lifecycle, retry logic, and a fluent API for creating
 * data processing pipelines.
 *
 * @template PrepRes The type of data returned by the `prep` phase.
 * @template ExecRes The type of data returned by the `exec` phase.
 * @template PostRes The type of the action returned by the `post` phase.
 */
export class Node<PrepRes = any, ExecRes = any, PostRes = any> extends AbstractNode {
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
		if (e instanceof AbortError || e instanceof WorkflowError) {
			return e
		}
		return new WorkflowError(`Failed in ${phase} phase for node ${this.constructor.name}`, this.constructor.name, phase, e as Error)
	}

	/**
	 * (Lifecycle) Prepares data for execution. Runs once before `exec`.
	 * This is the ideal place to read data from the `Context`.
	 * @param _args The arguments for the node, including `ctx` and `params`.
	 * @returns The data required by the `exec` phase.
	 */
	async prep(_args: NodeArgs<void, void>): Promise<PrepRes> { return undefined as unknown as PrepRes }

	/**
	 * (Lifecycle) Performs the core, isolated logic of the node.
	 * This is the only phase that is retried on failure. It should not access the `Context` directly.
	 * @param _args The arguments for the node, including `prepRes`.
	 * @returns The result of the execution.
	 */
	async exec(_args: NodeArgs<PrepRes, void>): Promise<ExecRes> { return undefined as unknown as ExecRes }

	/**
	 * (Lifecycle) Processes results and determines the next step. Runs once after `exec` succeeds.
	 * This is the ideal place to write data to the `Context`.
	 * @param _args The arguments for the node, including `execRes`.
	 * @returns An "action" string to determine which successor to execute next. Defaults to `DEFAULT_ACTION`.
	 */
	async post(_args: NodeArgs<PrepRes, ExecRes>): Promise<PostRes> { return DEFAULT_ACTION as any }

	/**
	 * (Lifecycle) A fallback that runs if all `exec` retries fail.
	 * If not implemented, the final error will be re-thrown, halting the workflow.
	 * @param args The arguments for the node, including the final `error` that caused the failure.
	 * @returns A fallback result of type `ExecRes`, allowing the workflow to recover and continue.
	 */
	async execFallback(args: NodeArgs<PrepRes, void>): Promise<ExecRes> {
		if (args.error) {
			throw args.error
		}
		throw new Error(`Node ${this.constructor.name} failed and has no fallback implementation.`)
	}

	/**
	 * The internal retry-aware execution logic for the `exec` phase.
	 * @internal
	 */
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

	/**
	 * The internal method that executes the node's full lifecycle.
	 * @internal
	 */
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
	 * Runs the node as a standalone unit, independent of a larger flow.
	 * This is useful for testing individual nodes in isolation.
	 *
	 * @param ctx The shared workflow context.
	 * @param options Runtime options like a logger or abort controller.
	 * @returns The result of the node's `post` method (its action).
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
	tap(fn: (result: ExecRes) => void | Promise<void>): Node<PrepRes, ExecRes, PostRes> {
		return this.map(async (result) => {
			await fn(result)
			return result
		})
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
 * A special type of `Node` that orchestrates a graph of other nodes.
 * It can contain its own middleware and can be composed within other flows.
 */
export class Flow extends Node<any, any, any> {
	/** The first node to be executed in this flow's graph. */
	public startNode?: AbstractNode
	/** An array of middleware functions to be applied to every node within this flow. */
	public middleware: Middleware[] = []

	/**
	 * @param start An optional node to start the flow with.
	 */
	constructor(start?: AbstractNode) {
		super()
		this.startNode = start
	}

	protected _wrapError(e: any, phase: 'prep' | 'exec' | 'post'): Error {
		if (phase === 'exec') {
			// Errors from a sub-flow's orchestration are already wrapped, so we pass them through.
			return e
		}
		return super._wrapError(e, phase)
	}

	/**
	 * Adds a middleware function to this flow. Middleware will be executed in the
	 * order it is added, wrapping the execution of every node within this flow.
	 * @param fn The middleware function to add.
	 * @returns The `Flow` instance for chaining.
	 */
	public use(fn: Middleware): this {
		this.middleware.push(fn)
		return this
	}

	/**
	 * Sets the starting node of the flow's graph.
	 * @param start The node to start with.
	 * @returns The start node instance, allowing for further chaining (`.next()`).
	 */
	start(start: AbstractNode): AbstractNode {
		this.startNode = start
		return start
	}

	/**
	 * (Lifecycle) Executes this flow's internal graph when it is used as a sub-flow
	 * (a node within a larger flow).
	 * @internal
	 * @param args The arguments for the node, passed down from the parent executor.
	 * @returns The final action returned by the last node in this flow's graph.
	 */
	async exec(args: NodeArgs<any, any>): Promise<any> {
		// For programmatic composition, a Flow node orchestrates its own graph.
		// This is a feature of the InMemoryExecutor. Distributed systems should
		// rely on pre-flattened graphs produced by the GraphBuilder.
		if (!(args.executor instanceof InMemoryExecutor)) {
			throw new TypeError('Programmatic sub-flow execution is only supported by the InMemoryExecutor. For other environments, use GraphBuilder to create a single, flattened workflow.')
		}

		if (!this.startNode) {
			// This handles logic-bearing flows like BatchFlow that override exec directly.
			return super.exec(args)
		}

		args.logger.info(`-- Entering sub-flow: ${this.constructor.name} --`)

		const combinedParams = { ...args.params, ...this.params }
		const internalOptions: InternalRunOptions = {
			logger: args.logger,
			signal: args.signal,
			params: combinedParams,
			executor: args.executor,
		}

		const finalAction = await args.executor._orch(
			this.startNode,
			this.middleware,
			args.ctx,
			internalOptions,
		)

		args.logger.info(`-- Exiting sub-flow: ${this.constructor.name} --`)
		return finalAction
	}

	/**
	 * (Lifecycle) The post-execution step for a `Flow` node. It simply passes through
	 * the final action from its internal graph execution (`execRes`).
	 * @internal
	 */
	async post({ execRes }: NodeArgs<any, any>): Promise<any> {
		return execRes
	}

	/**
	 * Runs the entire flow as a top-level entry point.
	 * @param ctx The shared workflow context.
	 * @param options Runtime options like a logger, abort controller, or a custom executor.
	 * @returns The final action returned by the last node in the flow.
	 */
	async run(ctx: Context, options?: RunOptions): Promise<any> {
		const executor = options?.executor ?? new InMemoryExecutor()
		return executor.run(this, ctx, options)
	}

	/**
	 * Finds a node within the flow's graph by its unique ID.
	 *
	 * This method performs a breadth-first search starting from the `startNode`.
	 * It is a convenient way to get a reference to a specific node instance
	 * for debugging or dynamic modifications.
	 *
	 * @remarks
	 * This performs a graph traversal on each call, which has a time complexity
	 * proportional to the number of nodes and edges in the graph (O(V+E)). For
	 * performance-critical applications or flows built with `GraphBuilder`,
	 * it is more efficient to use the `nodeMap` returned by `GraphBuilder.build()`.
	 *
	 * @param id The unique ID of the node to find (set via `.withId()` or by the `GraphBuilder`).
	 * @returns The `AbstractNode` instance if found, otherwise `undefined`.
	 */
	public getNodeById(id: string | number): AbstractNode | undefined {
		if (!this.startNode) {
			return undefined
		}

		const queue: AbstractNode[] = [this.startNode]
		const visited = new Set<AbstractNode>([this.startNode])
		while (queue.length > 0) {
			const currentNode = queue.shift()!

			if (currentNode.id === id) {
				return currentNode
			}

			for (const successor of currentNode.successors.values()) {
				if (!visited.has(successor)) {
					visited.add(successor)
					queue.push(successor)
				}
			}
		}

		return undefined
	}
}

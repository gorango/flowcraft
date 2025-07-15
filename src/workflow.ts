export type Params = Record<string, any>
export const DEFAULT_ACTION = 'default'

/**
 * Defines the interface for a logger that can be used by the workflow engine.
 */
export interface Logger {
	debug: (message: string, context?: object) => void
	info: (message: string, context?: object) => void
	warn: (message: string, context?: object) => void
	error: (message: string, context?: object) => void
}

/**
 * A default logger implementation that writes to the console.
 */
export class ConsoleLogger implements Logger {
	private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: object) {
		const fullMessage = `[${level.toUpperCase()}] ${message}`
		if (context && Object.keys(context).length > 0)
			console[level](fullMessage, context)
		else
			console[level](fullMessage)
	}

	debug(message: string, context?: object) { this.log('debug', message, context) }
	info(message: string, context?: object) { this.log('info', message, context) }
	warn(message: string, context?: object) { this.log('warn', message, context) }
	error(message: string, context?: object) { this.log('error', message, context) }
}

/**
 * Error thrown when a workflow is aborted via an AbortSignal.
 */
export class AbortError extends Error {
	constructor(message = 'Workflow aborted') {
		super(message)
		this.name = 'AbortError'
	}
}

/**
 * Custom error class for failures within the workflow, providing additional context.
 */
export class WorkflowError extends Error {
	constructor(
		message: string,
		public readonly nodeName: string,
		public readonly phase: 'prep' | 'exec' | 'post',
		public readonly originalError?: Error,
	) {
		super(message)
		this.name = 'WorkflowError'
		if (originalError?.stack)
			this.stack = `${this.stack}\nCaused by: ${originalError.stack}`
	}
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted)
			return reject(new AbortError())

		const timeoutId = setTimeout(resolve, ms)
		signal?.addEventListener('abort', () => {
			clearTimeout(timeoutId)
			reject(new AbortError())
		})
	})
}

/**
 * Defines the interface for the shared context object passed through the workflow.
 */
export interface WorkflowContext {
	get: <T>(key: any) => T | undefined
	set: <T>(key: any, value: T) => this
	has: (key: any) => boolean
}

/**
 * A type-safe, Map-based implementation of the WorkflowContext.
 */
export class TypedContext implements WorkflowContext {
	private data: Map<any, any>

	constructor(initialData?: Iterable<readonly [any, any]> | null) {
		this.data = new Map<any, any>(initialData)
	}

	get<T>(key: any): T | undefined {
		return this.data.get(key)
	}

	set<T>(key: any, value: T): this {
		this.data.set(key, value)
		return this
	}

	has(key: any): boolean {
		return this.data.has(key)
	}
}

export type Context = WorkflowContext

export interface NodeArgs<PrepRes = any, ExecRes = any> {
	ctx: Context
	params: Params
	signal?: AbortSignal
	logger: Logger
	prepRes: PrepRes
	execRes: ExecRes
	error?: Error
}

export interface NodeOptions {
	maxRetries?: number
	wait?: number
}

export interface RunOptions {
	controller?: AbortController
	logger?: Logger
}

export abstract class AbstractNode {
	public params: Params = {}
	public successors = new Map<string, AbstractNode>()

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
	next(node: AbstractNode, action: string = DEFAULT_ACTION): AbstractNode {
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
	async post(args: NodeArgs<PrepRes, ExecRes>): Promise<PostRes> { return DEFAULT_ACTION as unknown as PostRes }
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
		// This line should be theoretically unreachable due to the logic above.
		throw new Error('Execution failed after all retries.')
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
			if (e instanceof AbortError || e instanceof WorkflowError)
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
			if (e instanceof AbortError || e instanceof WorkflowError)
				throw e
			throw new WorkflowError(`Failed in exec phase for node ${this.constructor.name}`, this.constructor.name, 'exec', e as Error)
		}
		if (signal?.aborted)
			throw new AbortError()
		try {
			return await this.post({ ctx, params, signal, logger, prepRes, execRes })
		}
		catch (e) {
			if (e instanceof AbortError || e instanceof WorkflowError)
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
		const logger = options?.logger ?? new ConsoleLogger()
		if (this.successors.size > 0)
			logger.warn('Node.run() called directly on a node with successors. The flow will not continue. Use a Flow to execute a sequence.')
		return this._run(ctx, this.params, options?.controller?.signal, logger)
	}
}

/**
 * A special node that orchestrates a sequence of other nodes.
 */
export class Flow extends Node<any, any, any> {
	public startNode?: AbstractNode

	/**
	 * @param start An optional node to start the flow with.
	 */
	constructor(start?: AbstractNode) {
		super()
		this.startNode = start
	}

	/**
	 * A convenience static method to create a linear flow from a sequence of nodes.
	 * @param nodes The nodes to execute in order.
	 * @returns A new Flow instance.
	 */
	static sequence(...nodes: AbstractNode[]): Flow {
		if (nodes.length === 0)
			return new Flow()
		const flow = new Flow(nodes[0])
		let current = nodes[0]
		for (let i = 1; i < nodes.length; i++)
			current = current.next(nodes[i])
		return flow
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
		const actionKey = typeof action === 'string' ? action : DEFAULT_ACTION
		const nextNode = curr.successors.get(actionKey)
		if (nextNode) {
			logger.debug(`Action '${actionKey}' from ${curr.constructor.name} leads to ${nextNode.constructor.name}`, { action: actionKey })
		}
		else if (curr.successors.size > 0) {
			logger.info(`Flow ends: Action '${actionKey}' from ${curr.constructor.name} has no configured successor.`)
		}
		return nextNode
	}

	protected async _orch(ctx: Context, params: Params, signal: AbortSignal | undefined, logger: Logger): Promise<any> {
		let curr = this.startNode
		let lastAction: any
		while (curr) {
			if (signal?.aborted)
				throw new AbortError()
			lastAction = await curr._run(ctx, { ...params, ...curr.params }, signal, logger)
			curr = this.getNextNode(curr, lastAction, logger)
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
		const logger = options?.logger ?? new ConsoleLogger()
		return this._run(ctx, this.params, options?.controller?.signal, logger)
	}
}

/**
 * A flow that executes its workflow sequentially for each item in a collection.
 */
export class BatchFlow extends Flow {
	/**
	 * Prepares the list of items to be processed.
	 * @returns An array or iterable of parameter objects, one for each item.
	 */
	async prep(args: NodeArgs): Promise<Iterable<any>> {
		return []
	}

	async exec(args: NodeArgs<any, void>): Promise<any> {
		const combinedParams = { ...this.params, ...args.params }
		const batchParamsIterable = (await this.prep(args)) || []
		const batchParamsList = Array.from(batchParamsIterable)

		args.logger.info(`BatchFlow: Starting sequential processing of ${batchParamsList.length} items.`)
		for (const [index, batchParams] of batchParamsList.entries()) {
			if (args.signal?.aborted)
				throw new AbortError()
			args.logger.debug(`BatchFlow: Processing item ${index + 1}/${batchParamsList.length}.`, { params: batchParams })
			await this._orch(args.ctx, { ...combinedParams, ...batchParams }, args.signal, args.logger)
		}
		return null
	}
}

/**
 * A flow that executes its workflow in parallel for each item in a collection.
 */
export class ParallelBatchFlow extends Flow {
	/**
	 * Prepares the list of items to be processed.
	 * @returns An array or iterable of parameter objects, one for each item.
	 */
	async prep(args: NodeArgs): Promise<Iterable<any>> {
		return []
	}

	async exec(args: NodeArgs<any, void>): Promise<any> {
		const combinedParams = { ...this.params, ...args.params }
		const batchParamsIterable = (await this.prep(args)) || []
		const batchParamsList = Array.from(batchParamsIterable)

		args.logger.info(`ParallelBatchFlow: Starting parallel processing of ${batchParamsList.length} items.`)
		if (args.signal?.aborted)
			throw new AbortError()

		const promises = batchParamsList.map(batchParams =>
			this._orch(args.ctx, { ...combinedParams, ...batchParams }, args.signal, args.logger),
		)
		await Promise.all(promises)
		return null
	}
}

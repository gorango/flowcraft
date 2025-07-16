import type { Context } from './context'
import type { Logger } from './logger'
import type { NodeArgs, NodeOptions, Params, RunOptions } from './types'
import { AbortError, WorkflowError } from './errors'
import { ConsoleLogger } from './logger'
import { DEFAULT_ACTION } from './types'
import { sleep } from './utils'

export * from './context'
export * from './errors'
export * from './logger'
export * from './types'

export abstract class AbstractNode {
	public params: Params = {}
	public successors = new Map<string | typeof DEFAULT_ACTION, AbstractNode>()

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
	next(node: AbstractNode, action: string | typeof DEFAULT_ACTION = DEFAULT_ACTION): AbstractNode {
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

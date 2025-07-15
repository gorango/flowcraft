export type Context = Map<any, any>
export type Params = Record<string, any>
export const DEFAULT_ACTION = 'default'

export interface Logger {
	debug: (message: string, context?: object) => void
	info: (message: string, context?: object) => void
	warn: (message: string, context?: object) => void
	error: (message: string, context?: object) => void
}

export class ConsoleLogger implements Logger {
	debug(message: string, context?: object) { console.debug(`[DEBUG] ${message}`, context ?? '') }
	info(message: string, context?: object) { console.info(`[INFO] ${message}`, context ?? '') }
	warn(message: string, context?: object) { console.warn(`[WARN] ${message}`, context ?? '') }
	error(message: string, context?: object) { console.error(`[ERROR] ${message}`, context ?? '') }
}

export class AbortError extends Error {
	constructor(message = 'Workflow aborted') {
		super(message)
		this.name = 'AbortError'
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

export interface NodeArgs<PrepRes = any, ExecRes = any> {
	ctx: Context
	params: Params
	signal?: AbortSignal
	logger: Logger
	prepRes: PrepRes
	execRes: ExecRes
	error?: Error
}

export interface RunOptions {
	controller?: AbortController
	logger?: Logger
}

export abstract class AbstractNode {
	public params: Params = {}
	public successors = new Map<string, AbstractNode>()

	setParams(params: Params): this {
		this.params = { ...params }
		return this
	}

	next(node: AbstractNode, action: string = DEFAULT_ACTION): AbstractNode {
		// Note: The previous warning about overwriting a successor has been removed.
		// It's a valid use case, and logging can be handled by the user if desired.
		this.successors.set(action, node)
		return node
	}

	abstract _run(ctx: Context, params: Params, signal: AbortSignal | undefined, logger: Logger): Promise<any>
}

export class Node<PrepRes = any, ExecRes = any, PostRes = any> extends AbstractNode {
	public maxRetries: number
	public wait: number
	public curRetry = 0

	constructor(maxRetries = 1, wait = 0) {
		super()
		this.maxRetries = maxRetries
		this.wait = wait
	}

	async prep(args: NodeArgs<void, void>): Promise<PrepRes> { return undefined as any }
	async exec(args: NodeArgs<PrepRes, void>): Promise<ExecRes> { return undefined as any }
	async post(args: NodeArgs<PrepRes, ExecRes>): Promise<PostRes> { return DEFAULT_ACTION as any }
	async execFallback(args: NodeArgs<PrepRes, void>): Promise<ExecRes> { throw args.error }

	async _exec(args: NodeArgs<PrepRes, void>): Promise<ExecRes> {
		for (this.curRetry = 0; this.curRetry < this.maxRetries; this.curRetry++) {
			if (args.signal?.aborted)
				throw new AbortError()
			try {
				return await this.exec(args)
			}
			catch (e) {
				const error = e as Error
				if (error instanceof AbortError || error.name === 'AbortError')
					throw error
				if (this.curRetry < this.maxRetries - 1) {
					args.logger.warn(`Attempt ${this.curRetry + 1}/${this.maxRetries} failed for ${this.constructor.name}. Retrying...`, { error })
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
		throw new Error('Execution failed after all retries.')
	}

	async _run(ctx: Context, params: Params, signal: AbortSignal | undefined, logger: Logger): Promise<PostRes> {
		logger.info(`Running node: ${this.constructor.name}`)
		if (signal?.aborted)
			throw new AbortError()
		const prepRes = await this.prep({ ctx, params, signal, logger, prepRes: undefined, execRes: undefined })
		if (signal?.aborted)
			throw new AbortError()
		const execRes = await this._exec({ ctx, params, signal, logger, prepRes, execRes: undefined })
		if (signal?.aborted)
			throw new AbortError()
		return await this.post({ ctx, params, signal, logger, prepRes, execRes })
	}

	async run(ctx: Context, options?: RunOptions): Promise<PostRes> {
		const logger = options?.logger ?? new ConsoleLogger()
		if (this.successors.size > 0)
			logger.warn('Node.run() called directly on a node with successors. The flow will not continue. Use a Flow to execute a sequence.')
		return this._run(ctx, this.params, options?.controller?.signal, logger)
	}
}

export class Flow extends Node {
	public startNode?: AbstractNode

	constructor(start?: AbstractNode) {
		super()
		this.startNode = start
	}

	start(start: AbstractNode): AbstractNode {
		this.startNode = start
		return start
	}

	getNextNode(curr: AbstractNode, action: any, logger: Logger): AbstractNode | undefined {
		const actionKey = typeof action === 'string' ? action : DEFAULT_ACTION
		const nextNode = curr.successors.get(actionKey)
		if (nextNode) {
			logger.debug(`Action '${actionKey}' from ${curr.constructor.name} leads to ${nextNode.constructor.name}`)
		}
		else if (curr.successors.size > 0) {
			logger.info(`Flow ends: Action '${actionKey}' from ${curr.constructor.name} has no configured successor.`)
		}
		return nextNode
	}

	async _orch(ctx: Context, params: Params, signal: AbortSignal | undefined, logger: Logger): Promise<any> {
		let curr = this.startNode
		let lastAction: any
		while (curr) {
			if (signal?.aborted)
				throw new AbortError()
			lastAction = await curr._run(ctx, params, signal, logger)
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

	async run(ctx: Context, options?: RunOptions): Promise<any> {
		const logger = options?.logger ?? new ConsoleLogger()
		return this._run(ctx, this.params, options?.controller?.signal, logger)
	}
}

export class BatchFlow extends Flow {
	async exec(args: NodeArgs<any, void>): Promise<any> {
		const combinedParams = { ...this.params, ...args.params }
		const batchParamsList = (await this.prep(args)) as any[] || []
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

export class ParallelBatchFlow extends Flow {
	async exec(args: NodeArgs<any, void>): Promise<any> {
		const combinedParams = { ...this.params, ...args.params }
		const batchParamsList = (await this.prep(args)) as any[] || []
		args.logger.info(`ParallelBatchFlow: Starting parallel processing of ${batchParamsList.length} items.`)
		const promises = batchParamsList.map(batchParams =>
			this._orch(args.ctx, { ...combinedParams, ...batchParams }, args.signal, args.logger),
		)
		await Promise.all(promises)
		return null
	}
}

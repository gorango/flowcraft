export type Context = Map<any, any>
export type Params = Record<string, any>
export const DEFAULT_ACTION = 'default'

function warn(message: string): void {
	console.warn(`WARN: Workflow - ${message}`)
}
async function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}

export interface NodeArgs<PrepRes = any, ExecRes = any> {
	ctx: Context
	params: Params
	prepRes: PrepRes
	execRes: ExecRes
	error?: Error
}

export abstract class AbstractNode {
	public params: Params = {}
	public successors = new Map<string, AbstractNode>()

	setParams(params: Params): this {
		this.params = { ...params }
		return this
	}

	next(node: AbstractNode, action: string = DEFAULT_ACTION): AbstractNode {
		if (this.successors.has(action))
			warn(`Overwriting successor for action '${action}' in node ${this.constructor.name}`)

		this.successors.set(action, node)
		return node
	}

	abstract _run(ctx: Context, params: Params): Promise<any>
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
			try {
				return await this.exec(args)
			}
			catch (e) {
				const error = e as Error
				if (this.curRetry === this.maxRetries - 1)
					return await this.execFallback({ ...args, error })

				if (this.wait > 0)
					await sleep(this.wait)
			}
		}
		throw new Error('Execution failed after all retries.')
	}

	async _run(ctx: Context, params: Params): Promise<PostRes> {
		const prepRes = await this.prep({ ctx, params, prepRes: undefined, execRes: undefined })
		const execRes = await this._exec({ ctx, params, prepRes, execRes: undefined })
		return await this.post({ ctx, params, prepRes, execRes })
	}

	async run(ctx: Context): Promise<PostRes> {
		if (this.successors.size > 0)
			warn('Node won\'t run successors. Use Flow.')
		return this._run(ctx, this.params)
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

	getNextNode(curr: AbstractNode, action: any): AbstractNode | undefined {
		const actionKey = typeof action === 'string' ? action : DEFAULT_ACTION
		const nextNode = curr.successors.get(actionKey)
		if (!nextNode && curr.successors.size > 0)
			warn(`Flow ends: Action '${actionKey}' not found in successors of node ${curr.constructor.name}`)

		return nextNode
	}

	async _orch(ctx: Context, params: Params): Promise<any> {
		let curr = this.startNode
		let lastAction: any
		while (curr) {
			lastAction = await curr._run(ctx, params)
			curr = this.getNextNode(curr, lastAction)
		}
		return lastAction
	}

	async exec(args: NodeArgs<any, any>): Promise<any> {
		const combinedParams = { ...this.params, ...args.params }
		return await this._orch(args.ctx, combinedParams)
	}

	async post({ execRes }: NodeArgs<any, any>): Promise<any> {
		return execRes
	}
}

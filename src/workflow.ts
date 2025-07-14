export type Context = Map<any, any>
export type Params = Record<string, any>
export const DEFAULT_ACTION = 'default'

function warn(message: string): void {
	console.warn(`WARN: Workflow - ${message}`)
}
async function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}

export abstract class AbstractNode {
	public params: Params = {}
	public successors = new Map<string, AbstractNode>()

	setParams(params: Params): this {
		this.params = { ...params }
		return this
	}

	next(node: AbstractNode, action: string = DEFAULT_ACTION): AbstractNode {
		if (this.successors.has(action)) {
			warn(`Overwriting successor for action '${action}' in node ${this.constructor.name}`)
		}
		this.successors.set(action, node)
		return node
	}

	abstract _run(ctx: Context, params: Params): any
}

// --- Synchronous Node Hierarchy ---
export class BaseNode<PrepRes = any, ExecRes = any, PostRes = any> extends AbstractNode {
	prep(ctx: Context, params: Params): PrepRes { return undefined as PrepRes }
	exec(prepRes: PrepRes, params: Params): ExecRes { return undefined as ExecRes }
	post(ctx: Context, prepRes: PrepRes, execRes: ExecRes, params: Params): PostRes { return DEFAULT_ACTION as any }

	_exec(prepRes: PrepRes, params: Params): ExecRes {
		return this.exec(prepRes, params)
	}

	_run(ctx: Context, params: Params): PostRes {
		const p = this.prep(ctx, params)
		const e = this._exec(p, params)
		return this.post(ctx, p, e, params)
	}

	run(ctx: Context): PostRes {
		if (this.successors.size > 0)
			warn('Node won\'t run successors. Use Flow.')
		return this._run(ctx, this.params)
	}
}

export class Node<PrepRes = any, ExecRes = any, PostRes = any> extends BaseNode<PrepRes, ExecRes, PostRes> {
	public maxRetries: number
	public wait: number
	public curRetry = 0

	constructor(maxRetries = 1, wait = 0) {
		super()
		this.maxRetries = maxRetries
		this.wait = wait
	}

	execFallback(prepRes: PrepRes, exc: Error, params: Params): ExecRes { throw exc }

	_exec(prepRes: PrepRes, params: Params): ExecRes {
		for (this.curRetry = 0; this.curRetry < this.maxRetries; this.curRetry++) {
			try {
				return this.exec(prepRes, params)
			}
			catch (e) {
				if (this.curRetry === this.maxRetries - 1) {
					return this.execFallback(prepRes, e as Error, params)
				}
				if (this.wait > 0) {
					const start = Date.now()
					while (Date.now() - start < this.wait) { /* sync wait */ }
				}
			}
		}
		throw new Error('Execution failed after all retries.')
	}
}

// --- Asynchronous Node Hierarchy ---
export class AsyncBaseNode<PrepRes = any, ExecRes = any, PostRes = any> extends AbstractNode {
	async prepAsync(ctx: Context, params: Params): Promise<PrepRes> { return undefined as any }
	async execAsync(prepRes: PrepRes, params: Params): Promise<ExecRes> { return undefined as any }
	async postAsync(ctx: Context, prepRes: PrepRes, execRes: ExecRes, params: Params): Promise<PostRes> { return DEFAULT_ACTION as any }

	async _execAsync(prepRes: PrepRes, params: Params): Promise<ExecRes> {
		return this.execAsync(prepRes, params)
	}

	async _run(ctx: Context, params: Params): Promise<PostRes> {
		const p = await this.prepAsync(ctx, params)
		const e = await this._execAsync(p, params)
		return await this.postAsync(ctx, p, e, params)
	}

	async runAsync(ctx: Context): Promise<PostRes> {
		if (this.successors.size > 0)
			warn('Node won\'t run successors. Use AsyncFlow.')
		return this._run(ctx, this.params)
	}
}

export class AsyncNode<PrepRes = any, ExecRes = any, PostRes = any> extends AsyncBaseNode<PrepRes, ExecRes, PostRes> {
	public maxRetries: number
	public wait: number
	public curRetry = 0

	constructor(maxRetries = 1, wait = 0) {
		super()
		this.maxRetries = maxRetries
		this.wait = wait
	}

	async execFallbackAsync(prepRes: PrepRes, exc: Error, params: Params): Promise<ExecRes> { throw exc }

	async _execAsync(prepRes: PrepRes, params: Params): Promise<ExecRes> {
		for (this.curRetry = 0; this.curRetry < this.maxRetries; this.curRetry++) {
			try {
				return await this.execAsync(prepRes, params)
			}
			catch (e) {
				if (this.curRetry === this.maxRetries - 1) {
					return await this.execFallbackAsync(prepRes, e as Error, params)
				}
				if (this.wait > 0)
					await sleep(this.wait)
			}
		}
		throw new Error('Async execution failed after all retries.')
	}
}

// --- Flow Implementations ---
export class Flow extends BaseNode {
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
		if (!nextNode && curr.successors.size > 0) {
			warn(`Flow ends: Action '${actionKey}' not found in successors of node ${curr.constructor.name}`)
		}
		return nextNode
	}

	_orch(ctx: Context, params: Params): any {
		let curr = this.startNode
		let lastAction: any
		while (curr) {
			if (curr instanceof AsyncBaseNode) {
				throw new TypeError('Cannot run an async node inside a synchronous Flow. Use AsyncFlow instead.')
			}
			lastAction = curr._run(ctx, params)
			curr = this.getNextNode(curr, lastAction)
		}
		return lastAction
	}

	_run(ctx: Context, params: Params) {
		const p = this.prep(ctx, params)
		const combinedParams = { ...this.params, ...params }
		const o = this._orch(ctx, combinedParams)
		return this.post(ctx, p, o, combinedParams)
	}

	post(ctx: Context, prepRes: any, execRes: any, params: Params) {
		return execRes
	}
}

export class BatchFlow extends Flow {
	_run(ctx: Context, params: Params) {
		const combinedParams = { ...this.params, ...params }
		const prepRes = (this.prep(ctx, combinedParams) as any[]) || []
		for (const batchParams of prepRes) {
			this._orch(ctx, { ...combinedParams, ...batchParams })
		}
		return this.post(ctx, prepRes, null, combinedParams)
	}
}

export class AsyncFlow extends AsyncBaseNode {
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
		if (!nextNode && curr.successors.size > 0) {
			warn(`Flow ends: Action '${actionKey}' not found in successors of node ${curr.constructor.name}`)
		}
		return nextNode
	}

	async _orchAsync(ctx: Context, params: Params): Promise<any> {
		let curr = this.startNode
		let lastAction: any
		while (curr) {
			if (curr instanceof AsyncBaseNode) {
				lastAction = await curr._run(ctx, params)
			}
			else {
				lastAction = curr._run(ctx, params)
			}
			curr = this.getNextNode(curr, lastAction)
		}
		return lastAction
	}

	async _run(ctx: Context, params: Params) {
		const combinedParams = { ...this.params, ...params }
		const p = await this.prepAsync(ctx, combinedParams)
		const o = await this._orchAsync(ctx, combinedParams)
		return await this.postAsync(ctx, p, o, combinedParams)
	}

	async postAsync(ctx: Context, prepRes: any, execRes: any, params: Params) {
		return execRes
	}
}

export class AsyncBatchFlow extends AsyncFlow {
	async _run(ctx: Context, params: Params) {
		const combinedParams = { ...this.params, ...params }
		const prepRes = (await this.prepAsync(ctx, combinedParams)) as any[] || []
		for (const batchParams of prepRes) {
			await this._orchAsync(ctx, { ...combinedParams, ...batchParams })
		}
		return this.postAsync(ctx, prepRes, null, combinedParams)
	}
}

export class AsyncParallelBatchFlow extends AsyncFlow {
	async _run(ctx: Context, params: Params) {
		const combinedParams = { ...this.params, ...params }
		const prepRes = (await this.prepAsync(ctx, combinedParams)) as any[] || []
		const promises = prepRes.map(batchParams =>
			this._orchAsync(ctx, { ...combinedParams, ...batchParams }),
		)
		await Promise.all(promises)
		return this.postAsync(ctx, prepRes, null, combinedParams)
	}
}

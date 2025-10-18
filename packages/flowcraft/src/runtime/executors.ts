import { AsyncContextView } from '../context'
import { FlowcraftError } from '../errors'
import type {
	ContextImplementation,
	IAsyncContext,
	IEventBus,
	ILogger,
	ISyncContext,
	Middleware,
	NodeClass,
	NodeContext,
	NodeDefinition,
	NodeFunction,
	NodeResult,
	WorkflowBlueprint,
} from '../types'
import type { WorkflowState } from './state'

async function withRetries<T>(
	executor: () => Promise<T>,
	maxRetries: number,
	nodeDef: NodeDefinition,
	context: NodeContext<any, any, any>,
	executionId?: string,
	signal?: AbortSignal,
	eventBus?: IEventBus,
): Promise<T> {
	let lastError: any
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			signal?.throwIfAborted()
			const result = await executor()
			if (attempt > 1) {
				context.dependencies.logger.info(`Node execution succeeded after retry`, {
					nodeId: nodeDef.id,
					attempt,
					executionId,
				})
			}
			return result
		} catch (error) {
			lastError = error
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new FlowcraftError('Workflow cancelled', {
					isFatal: false,
				})
			}
			if (error instanceof FlowcraftError && error.isFatal) break
			if (attempt < maxRetries) {
				context.dependencies.logger.warn(`Node execution failed, retrying`, {
					nodeId: nodeDef.id,
					attempt,
					maxRetries,
					error: error instanceof Error ? error.message : String(error),
					executionId,
				})
				if (eventBus) {
					await eventBus.emit({
						type: 'node:retry',
						payload: {
							nodeId: nodeDef.id,
							attempt,
							executionId: executionId || '',
							blueprintId: context.dependencies.blueprint?.id || '',
						},
					})
				}
			} else {
				context.dependencies.logger.error(`Node execution failed after all retries`, {
					nodeId: nodeDef.id,
					attempts: maxRetries,
					error: error instanceof Error ? error.message : String(error),
					executionId,
				})
			}
		}
	}
	throw lastError
}

export interface ExecutionStrategy {
	execute: (
		nodeDef: NodeDefinition,
		context: NodeContext<any, any, any>,
		executionId?: string,
		signal?: AbortSignal,
	) => Promise<NodeResult<any, any>>
}

export class FunctionNodeExecutor implements ExecutionStrategy {
	constructor(
		private implementation: NodeFunction,
		private maxRetries: number,
		private eventBus: IEventBus,
	) {}

	async execute(
		nodeDef: NodeDefinition,
		context: NodeContext<any, any, any>,
		executionId?: string,
		signal?: AbortSignal,
	): Promise<NodeResult<any, any>> {
		return withRetries(
			() => this.implementation(context),
			this.maxRetries,
			nodeDef,
			context,
			executionId,
			signal,
			this.eventBus,
		)
	}
}

export class ClassNodeExecutor implements ExecutionStrategy {
	constructor(
		private implementation: NodeClass,
		private maxRetries: number,
		private eventBus: IEventBus,
	) {}

	async execute(
		nodeDef: NodeDefinition,
		context: NodeContext<any, any, any>,
		executionId?: string,
		signal?: AbortSignal,
	): Promise<NodeResult<any, any>> {
		const instance = new this.implementation(nodeDef.params || {})
		let lastError: Error | undefined
		try {
			signal?.throwIfAborted()
			const prepResult = await instance.prep(context)
			let execResult: Omit<NodeResult, 'error'> | undefined
			try {
				execResult = await withRetries(
					() => instance.exec(prepResult, context),
					this.maxRetries,
					nodeDef,
					context,
					executionId,
					signal,
					this.eventBus,
				)
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error))
				if (error instanceof DOMException && error.name === 'AbortError') {
					throw new FlowcraftError('Workflow cancelled', {
						isFatal: false,
					})
				}
				if (error instanceof FlowcraftError && error.isFatal) {
					throw error
				}
			}
			if (lastError) {
				signal?.throwIfAborted()
				execResult = await instance.fallback(lastError, context)
			}
			signal?.throwIfAborted()
			if (!execResult) {
				throw new Error('Execution failed after all retries')
			}
			return await instance.post(execResult, context)
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error))
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new FlowcraftError('Workflow cancelled', {
					isFatal: false,
				})
			}
			throw error
		} finally {
			if (lastError) {
				try {
					await instance.recover(lastError, context)
				} catch (recoverError) {
					context.dependencies.logger.warn(`Recover phase failed`, {
						nodeId: nodeDef.id,
						originalError: lastError.message,
						recoverError: recoverError instanceof Error ? recoverError.message : String(recoverError),
						executionId,
					})
				}
			}
		}
	}
}

export class BuiltInNodeExecutor implements ExecutionStrategy {
	constructor(
		private executeBuiltIn: (
			nodeDef: NodeDefinition,
			context: ContextImplementation<any>,
		) => Promise<NodeResult<any, any>>,
	) {}

	async execute(
		nodeDef: NodeDefinition,
		context: NodeContext<Record<string, unknown>, Record<string, unknown>, any>,
	): Promise<NodeResult<any, any>> {
		return this.executeBuiltIn(nodeDef, context.context as ContextImplementation<any>)
	}
}

export type NodeExecutionResult =
	| { status: 'success'; result: NodeResult<any, any> }
	| { status: 'failed_with_fallback'; fallbackNodeId: string; error: FlowcraftError }
	| { status: 'failed'; error: FlowcraftError }

export interface NodeExecutorConfig<TContext extends Record<string, any>, TDependencies extends Record<string, any>> {
	blueprint: WorkflowBlueprint
	nodeDef: NodeDefinition
	state: WorkflowState<TContext>
	dependencies: TDependencies
	logger: ILogger
	eventBus: IEventBus
	middleware: Middleware[]
	strategy: ExecutionStrategy
	executionId?: string
	signal?: AbortSignal
}

export class NodeExecutor<TContext extends Record<string, any>, TDependencies extends Record<string, any>> {
	private blueprint: WorkflowBlueprint
	private nodeDef: NodeDefinition
	private state: WorkflowState<TContext>
	private dependencies: TDependencies
	private logger: ILogger
	private eventBus: IEventBus
	private middleware: Middleware[]
	private strategy: ExecutionStrategy
	private executionId?: string
	private signal?: AbortSignal

	constructor(config: NodeExecutorConfig<TContext, TDependencies>) {
		this.blueprint = config.blueprint
		this.nodeDef = config.nodeDef
		this.state = config.state
		this.dependencies = config.dependencies
		this.logger = config.logger
		this.eventBus = config.eventBus
		this.middleware = config.middleware
		this.strategy = config.strategy
		this.executionId = config.executionId
		this.signal = config.signal
	}

	async execute(input: any): Promise<NodeExecutionResult> {
		const contextImpl = this.state.getContext()
		const asyncContext: IAsyncContext<TContext> =
			contextImpl.type === 'sync'
				? new AsyncContextView(contextImpl as ISyncContext<TContext>)
				: (contextImpl as IAsyncContext<TContext>)

		const nodeContext: NodeContext<TContext, TDependencies, any> = {
			context: asyncContext,
			input,
			params: this.nodeDef.params || {},
			dependencies: { ...this.dependencies, logger: this.logger },
			signal: this.signal,
		}

		const beforeHooks = this.middleware
			.map((m) => m.beforeNode)
			.filter((hook): hook is NonNullable<Middleware['beforeNode']> => !!hook)
		const afterHooks = this.middleware
			.map((m) => m.afterNode)
			.filter((hook): hook is NonNullable<Middleware['afterNode']> => !!hook)
		const aroundHooks = this.middleware
			.map((m) => m.aroundNode)
			.filter((hook): hook is NonNullable<Middleware['aroundNode']> => !!hook)

		const coreExecution = async (): Promise<NodeExecutionResult> => {
			let result: NodeResult | undefined
			let error: Error | undefined
			try {
				for (const hook of beforeHooks) await hook(nodeContext.context, this.nodeDef.id)
				result = await this.strategy.execute(this.nodeDef, nodeContext, this.executionId, this.signal)
				return { status: 'success', result }
			} catch (e: any) {
				error = e instanceof Error ? e : new Error(String(e))
				const flowcraftError =
					error instanceof FlowcraftError
						? error
						: new FlowcraftError(`Node '${this.nodeDef.id}' execution failed`, {
								cause: error,
								nodeId: this.nodeDef.id,
								blueprintId: this.blueprint.id,
								executionId: this.executionId,
								isFatal: false,
							})
				const isFatal =
					flowcraftError.isFatal || (flowcraftError.cause instanceof FlowcraftError && flowcraftError.cause.isFatal)
				if (isFatal) {
					return { status: 'failed', error: flowcraftError }
				}
				const fallbackNodeId = this.nodeDef.config?.fallback
				if (fallbackNodeId) {
					this.logger.warn(`Node failed, fallback required`, {
						nodeId: this.nodeDef.id,
						fallbackNodeId,
						error: error.message,
						executionId: this.executionId,
					})
					await this.eventBus.emit({
						type: 'node:fallback',
						payload: {
							nodeId: this.nodeDef.id,
							executionId: this.executionId || '',
							fallback: fallbackNodeId,
							blueprintId: this.blueprint.id,
						},
					})
					return { status: 'failed_with_fallback', fallbackNodeId, error: flowcraftError }
				}
				return { status: 'failed', error: flowcraftError }
			} finally {
				for (const hook of afterHooks) await hook(nodeContext.context, this.nodeDef.id, result, error)
			}
		}

		let executionChain: () => Promise<NodeExecutionResult> = coreExecution
		for (let i = aroundHooks.length - 1; i >= 0; i--) {
			const hook = aroundHooks[i]
			const next = executionChain
			executionChain = async () => {
				let capturedResult: NodeExecutionResult | undefined
				const middlewareResult = await hook(nodeContext.context, this.nodeDef.id, async () => {
					capturedResult = await next()
					if (capturedResult.status === 'success') {
						return capturedResult.result
					}
					throw capturedResult.error
				})
				if (!capturedResult && middlewareResult) {
					return { status: 'success', result: middlewareResult }
				}
				if (!capturedResult) {
					throw new Error('Middleware did not call next() and did not return a result')
				}
				return capturedResult
			}
		}

		try {
			await this.eventBus.emit({
				type: 'node:start',
				payload: {
					nodeId: this.nodeDef.id,
					executionId: this.executionId || '',
					input: nodeContext.input,
					blueprintId: this.blueprint.id,
				},
			})
			const executionResult = await executionChain()
			if (executionResult.status === 'success') {
				await this.eventBus.emit({
					type: 'node:finish',
					payload: {
						nodeId: this.nodeDef.id,
						result: executionResult.result,
						executionId: this.executionId || '',
						blueprintId: this.blueprint.id,
					},
				})
			} else {
				await this.eventBus.emit({
					type: 'node:error',
					payload: {
						nodeId: this.nodeDef.id,
						error: executionResult.error,
						executionId: this.executionId || '',
						blueprintId: this.blueprint.id,
					},
				})
			}
			return executionResult
		} catch (error: any) {
			const err = error instanceof Error ? error : new Error(String(error))
			const flowcraftError =
				err instanceof FlowcraftError
					? err
					: new FlowcraftError(`Node '${this.nodeDef.id}' failed execution.`, {
							cause: err,
							nodeId: this.nodeDef.id,
							blueprintId: this.blueprint.id,
							executionId: this.executionId,
							isFatal: false,
						})
			await this.eventBus.emit({
				type: 'node:error',
				payload: {
					nodeId: this.nodeDef.id,
					error: flowcraftError,
					executionId: this.executionId || '',
					blueprintId: this.blueprint.id,
				},
			})
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new FlowcraftError('Workflow cancelled', {
					executionId: this.executionId,
					isFatal: false,
				})
			}
			throw error instanceof FlowcraftError && !error.isFatal
				? error
				: new FlowcraftError(`Node '${this.nodeDef.id}' failed execution.`, {
						cause: error,
						nodeId: this.nodeDef.id,
						blueprintId: this.blueprint.id,
						executionId: this.executionId,
						isFatal: false,
					})
		}
	}
}

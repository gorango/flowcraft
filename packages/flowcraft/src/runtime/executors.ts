import { FlowcraftError } from '../errors'
import type { IEventBus, Middleware, NodeClass, NodeContext, NodeDefinition, NodeFunction, NodeResult } from '../types'
import type { ExecutionContext } from './execution-context'

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
		const instance = new this.implementation(nodeDef.params || {}, nodeDef.id)
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

export type NodeExecutionResult =
	| { status: 'success'; result: NodeResult<any, any> }
	| { status: 'failed_with_fallback'; fallbackNodeId: string; error: FlowcraftError }
	| { status: 'failed'; error: FlowcraftError }

export interface NodeExecutorConfig<TContext extends Record<string, any>, TDependencies extends Record<string, any>> {
	context: ExecutionContext<TContext, TDependencies>
	nodeDef: NodeDefinition
	strategy: ExecutionStrategy
}

export class NodeExecutor<TContext extends Record<string, any>, TDependencies extends Record<string, any>> {
	private context: ExecutionContext<TContext, TDependencies>
	private nodeDef: NodeDefinition
	private strategy: ExecutionStrategy

	constructor(config: NodeExecutorConfig<TContext, TDependencies>) {
		this.context = config.context
		this.nodeDef = config.nodeDef
		this.strategy = config.strategy
	}

	async execute(input: any): Promise<NodeExecutionResult> {
		const asyncContext = this.context.state.getContext()

		const nodeContext: NodeContext<TContext, TDependencies, any> = {
			context: asyncContext,
			input,
			params: this.nodeDef.params || {},
			dependencies: {
				...this.context.services.dependencies,
				logger: this.context.services.logger,
				runtime: this.context,
				workflowState: this.context.state,
			},
			signal: this.context.signal,
		}

		const beforeHooks = this.context.services.middleware
			.map((m) => m.beforeNode)
			.filter((hook): hook is NonNullable<Middleware['beforeNode']> => !!hook)
		const afterHooks = this.context.services.middleware
			.map((m) => m.afterNode)
			.filter((hook): hook is NonNullable<Middleware['afterNode']> => !!hook)
		const aroundHooks = this.context.services.middleware
			.map((m) => m.aroundNode)
			.filter((hook): hook is NonNullable<Middleware['aroundNode']> => !!hook)

		const coreExecution = async (): Promise<NodeExecutionResult> => {
			let result: NodeResult | undefined
			let error: Error | undefined
			try {
				for (const hook of beforeHooks) await hook(nodeContext.context, this.nodeDef.id)
				result = await this.strategy.execute(this.nodeDef, nodeContext, this.context.executionId, this.context.signal)
				return { status: 'success', result }
			} catch (e: any) {
				error = e instanceof Error ? e : new Error(String(e))
				const flowcraftError =
					error instanceof FlowcraftError
						? error
						: new FlowcraftError(`Node '${this.nodeDef.id}' execution failed`, {
								cause: error,
								nodeId: this.nodeDef.id,
								blueprintId: this.context.blueprint.id,
								executionId: this.context.executionId,
								isFatal: false,
							})

				const fallbackNodeId = this.nodeDef.config?.fallback
				if (fallbackNodeId && !flowcraftError.isFatal) {
					this.context.services.logger.warn(`Node failed, fallback required`, {
						nodeId: this.nodeDef.id,
						fallbackNodeId,
						error: error.message,
						executionId: this.context.executionId,
					})
					await this.context.services.eventBus.emit({
						type: 'node:fallback',
						payload: {
							nodeId: this.nodeDef.id,
							executionId: this.context.executionId || '',
							fallback: fallbackNodeId,
							blueprintId: this.context.blueprint.id,
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
			await this.context.services.eventBus.emit({
				type: 'node:start',
				payload: {
					nodeId: this.nodeDef.id,
					executionId: this.context.executionId || '',
					input: nodeContext.input,
					blueprintId: this.context.blueprint.id,
				},
			})
			const executionResult = await executionChain()
			if (executionResult.status === 'success') {
				await this.context.services.eventBus.emit({
					type: 'node:finish',
					payload: {
						nodeId: this.nodeDef.id,
						result: executionResult.result,
						executionId: this.context.executionId || '',
						blueprintId: this.context.blueprint.id,
					},
				})
			} else {
				await this.context.services.eventBus.emit({
					type: 'node:error',
					payload: {
						nodeId: this.nodeDef.id,
						error: executionResult.error,
						executionId: this.context.executionId || '',
						blueprintId: this.context.blueprint.id,
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
							blueprintId: this.context.blueprint.id,
							executionId: this.context.executionId,
							isFatal: false,
						})
			await this.context.services.eventBus.emit({
				type: 'node:error',
				payload: {
					nodeId: this.nodeDef.id,
					error: flowcraftError,
					executionId: this.context.executionId || '',
					blueprintId: this.context.blueprint.id,
				},
			})
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new FlowcraftError('Workflow cancelled', {
					executionId: this.context.executionId,
					isFatal: false,
				})
			}
			throw error instanceof FlowcraftError && !error.isFatal
				? error
				: new FlowcraftError(`Node '${this.nodeDef.id}' failed execution.`, {
						cause: error,
						nodeId: this.nodeDef.id,
						blueprintId: this.context.blueprint.id,
						executionId: this.context.executionId,
						isFatal: false,
					})
		}
	}
}

import { CancelledWorkflowError, FatalNodeExecutionError } from '../errors'
import type {
	ContextImplementation,
	IEventBus,
	NodeClass,
	NodeContext,
	NodeDefinition,
	NodeFunction,
	NodeResult,
} from '../types'

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
				throw new CancelledWorkflowError('Workflow cancelled')
			}
			if (error instanceof FatalNodeExecutionError) break
			if (attempt < maxRetries) {
				context.dependencies.logger.warn(`Node execution failed, retrying`, {
					nodeId: nodeDef.id,
					attempt,
					maxRetries,
					error: error instanceof Error ? error.message : String(error),
					executionId,
				})
				if (eventBus) {
					await eventBus.emit('node:retry', {
						blueprintId: context.dependencies.blueprint?.id || '',
						nodeId: nodeDef.id,
						attempt,
						executionId,
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
					throw new CancelledWorkflowError('Workflow cancelled')
				}
				if (error instanceof FatalNodeExecutionError) {
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
				throw new CancelledWorkflowError('Workflow cancelled')
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

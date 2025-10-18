import { Context } from '../context'
import { FlowcraftError } from '../errors'
import type { ContextImplementation, ISerializer, WorkflowError, WorkflowResult } from '../types'

export class WorkflowState<TContext extends Record<string, any>> {
	private _completedNodes = new Set<string>()
	private errors: WorkflowError[] = []
	private anyFallbackExecuted = false
	private context: ContextImplementation<TContext>

	constructor(initialData: Partial<TContext>) {
		this.context = new Context<TContext>(initialData)
	}

	addCompletedNode(nodeId: string, output: any) {
		this._completedNodes.add(nodeId)
		this.context.set(`_outputs.${nodeId}` as any, output)
	}

	addError(nodeId: string, error: Error) {
		const flowcraftError = new FlowcraftError(error.message, {
			cause: error,
			nodeId,
			isFatal: false,
		})
		this.errors.push({
			...flowcraftError,
			timestamp: new Date().toISOString(),
			originalError: error, // Legacy compatibility
		})
	}

	clearError(nodeId: string) {
		this.errors = this.errors.filter((err) => err.nodeId !== nodeId)
	}

	markFallbackExecuted() {
		this.anyFallbackExecuted = true
	}

	getContext(): ContextImplementation<TContext> {
		return this.context
	}

	getCompletedNodes(): Set<string> {
		return new Set(this._completedNodes)
	}

	getErrors(): WorkflowError[] {
		return this.errors
	}

	getAnyFallbackExecuted(): boolean {
		return this.anyFallbackExecuted
	}

	getStatus(allNodeIds: Set<string>, _fallbackNodeIds: Set<string>): WorkflowResult['status'] {
		if (this.anyFallbackExecuted) return 'completed'
		if (this.errors.length > 0) return 'failed'
		// const _remainingNodes = [...allNodeIds].filter((id) => !this._completedNodes.has(id) && !fallbackNodeIds.has(id))
		return this._completedNodes.size < allNodeIds.size ? 'stalled' : 'completed'
	}

	toResult(serializer: ISerializer): WorkflowResult<TContext> {
		const contextJSON = this.context.toJSON() as TContext
		return {
			context: contextJSON,
			serializedContext: serializer.serialize(contextJSON),
			status: this.getStatus(new Set(), new Set()),
			errors: this.errors.length > 0 ? this.errors : undefined,
		}
	}
}

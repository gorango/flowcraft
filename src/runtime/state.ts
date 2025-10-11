import type { ContextImplementation, ISerializer, WorkflowError, WorkflowResult } from '../types'
import { Context } from '../context'

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
		this.context.set(nodeId as any, output)
	}

	addError(nodeId: string, error: Error) {
		this.errors.push({
			nodeId,
			message: error.message,
			originalError: error,
		})
	}

	clearError(nodeId: string) {
		this.errors = this.errors.filter(err => err.nodeId !== nodeId)
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

	getStatus(allNodeIds: Set<string>, fallbackNodeIds: Set<string>): WorkflowResult['status'] {
		if (this.anyFallbackExecuted)
			return 'completed'
		if (this.errors.length > 0)
			return 'failed'
		const _remainingNodes = [...allNodeIds].filter(id => !this._completedNodes.has(id) && !fallbackNodeIds.has(id))
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

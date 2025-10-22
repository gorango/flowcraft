import { AsyncContextView, Context as SyncContext } from '../context'
import { FlowcraftError } from '../errors'
import type { IAsyncContext, ISerializer, WorkflowError, WorkflowResult } from '../types'

export class WorkflowState<TContext extends Record<string, any>> {
	private _completedNodes = new Set<string>()
	private errors: WorkflowError[] = []
	private anyFallbackExecuted = false
	private context: IAsyncContext<TContext>
	private _isAwaiting = false
	private _awaitingNodeId: string | null = null

	constructor(initialData: Partial<TContext>) {
		this.context = new AsyncContextView(new SyncContext<TContext>(initialData))
		if ((initialData as any)._awaitingNodeId) {
			this._isAwaiting = true
			this._awaitingNodeId = (initialData as any)._awaitingNodeId
		}
		for (const key of Object.keys(initialData)) {
			if (key.startsWith('_outputs.')) {
				const nodeId = key.substring('_outputs.'.length)
				this._completedNodes.add(nodeId)
			}
		}
	}

	async addCompletedNode(nodeId: string, output: any) {
		this._completedNodes.add(nodeId)
		await this.context.set(`_outputs.${nodeId}` as any, output)
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

	getContext(): IAsyncContext<TContext> {
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

	markAsAwaiting(nodeId: string): void {
		this._isAwaiting = true
		this._awaitingNodeId = nodeId
		this.context.set('_awaitingNodeId' as any, nodeId)
	}

	isAwaiting(): boolean {
		return this._isAwaiting
	}

	getAwaitingNodeId(): string | null {
		return this._awaitingNodeId
	}

	clearAwaiting(): void {
		this._isAwaiting = false
		this._awaitingNodeId = null
		this.context.delete('_awaitingNodeId' as any)
	}

	getStatus(allNodeIds: Set<string>, _fallbackNodeIds: Set<string>): WorkflowResult['status'] {
		if (this._isAwaiting) return 'awaiting'
		if (this.anyFallbackExecuted) return 'completed'
		if (this.errors.length > 0) return 'failed'
		// const _remainingNodes = [...allNodeIds].filter((id) => !this._completedNodes.has(id) && !fallbackNodeIds.has(id))
		return this._completedNodes.size < allNodeIds.size ? 'stalled' : 'completed'
	}

	async toResult(serializer: ISerializer): Promise<WorkflowResult<TContext>> {
		const contextJSON = (await this.context.toJSON()) as TContext
		if (!this._isAwaiting && (contextJSON as any)._awaitingNodeId) {
			delete (contextJSON as any)._awaitingNodeId
		}
		return {
			context: contextJSON,
			serializedContext: serializer.serialize(contextJSON),
			status: this.getStatus(new Set(), new Set()),
			errors: this.errors.length > 0 ? this.errors : undefined,
		}
	}
}

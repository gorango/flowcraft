import { AsyncContextView, Context as SyncContext, TrackedAsyncContext } from '../context'
import { FlowcraftError } from '../errors'
import type { IAsyncContext, ISerializer, WorkflowError, WorkflowResult } from '../types'

export class WorkflowState<TContext extends Record<string, any>> {
	private _completedNodes = new Set<string>()
	private errors: WorkflowError[] = []
	private anyFallbackExecuted = false
	private context: IAsyncContext<TContext>
	private _isAwaiting = false
	private _awaitingNodeIds = new Set<string>()
	private _awaitingDetails = new Map<string, any>()

	constructor(initialData: Partial<TContext>) {
		this.context = new TrackedAsyncContext(new AsyncContextView(new SyncContext<TContext>(initialData)))
		if ((initialData as any)._awaitingNodeIds) {
			this._isAwaiting = true
			const awaitingIds = (initialData as any)._awaitingNodeIds
			if (Array.isArray(awaitingIds)) {
				for (const id of awaitingIds) {
					this._awaitingNodeIds.add(id)
				}
			}
		}
		if ((initialData as any)._awaitingDetails) {
			this._awaitingDetails = new Map(Object.entries((initialData as any)._awaitingDetails))
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
			originalError: error, // legacy compatibility
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

	async markAsAwaiting(nodeId: string, details?: any): Promise<void> {
		this._isAwaiting = true
		this._awaitingNodeIds.add(nodeId)
		if (details) {
			this._awaitingDetails.set(nodeId, details)
		}
		await this.context.set('_awaitingNodeIds' as any, Array.from(this._awaitingNodeIds))
		await this.context.set('_awaitingDetails' as any, Object.fromEntries(this._awaitingDetails))
	}

	isAwaiting(): boolean {
		return this._isAwaiting && this._awaitingNodeIds.size > 0
	}

	getAwaitingNodeIds(): string[] {
		return Array.from(this._awaitingNodeIds)
	}

	getAwaitingDetails(nodeId: string): any {
		return this._awaitingDetails.get(nodeId)
	}

	clearAwaiting(nodeId?: string): void {
		if (nodeId) {
			this._awaitingNodeIds.delete(nodeId)
			this._awaitingDetails.delete(nodeId)
		} else {
			this._awaitingNodeIds.clear()
			this._awaitingDetails.clear()
		}
		this._isAwaiting = this._awaitingNodeIds.size > 0

		if (this._awaitingNodeIds.size > 0) {
			this.context.set('_awaitingNodeIds' as any, Array.from(this._awaitingNodeIds))
			this.context.set('_awaitingDetails' as any, Object.fromEntries(this._awaitingDetails))
		} else {
			this.context.delete('_awaitingNodeIds' as any)
			this.context.delete('_awaitingDetails' as any)
		}
	}

	getStatus(isTraversalComplete = false): WorkflowResult['status'] {
		if (this._isAwaiting) return 'awaiting'
		if (this.anyFallbackExecuted) return 'completed'
		if (this.errors.length > 0) return 'failed'
		if (isTraversalComplete) return 'completed'
		return 'stalled'
	}

	async toResult(serializer: ISerializer): Promise<WorkflowResult<TContext>> {
		const contextJSON = (await this.context.toJSON()) as TContext
		if (!this._isAwaiting && (contextJSON as any)._awaitingNodeIds) {
			delete (contextJSON as any)._awaitingNodeIds
			delete (contextJSON as any)._awaitingDetails
		}
		return {
			context: contextJSON,
			serializedContext: serializer.serialize(contextJSON),
			status: this.getStatus(),
			errors: this.errors.length > 0 ? this.errors : undefined,
		}
	}
}

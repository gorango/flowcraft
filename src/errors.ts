/**
 * Error thrown when a node in a workflow fails during execution.
 * Provides detailed information about which node failed and the context.
 */
export class NodeExecutionError extends Error {
	constructor(
		message: string,
		public readonly nodeId: string,
		public readonly blueprintId: string,
		public readonly executionId: string,
		public readonly originalError?: Error,
	) {
		const combinedMessage = originalError
			? `${message}: ${originalError.message}`
			: message

		super(combinedMessage)
		this.name = 'NodeExecutionError'
		if (originalError?.stack)
			this.stack = `${this.stack}\nCaused by: ${originalError.stack}`
	}
}

/**
 * Error thrown when a workflow is gracefully aborted via an AbortSignal.
 */
export class CancelledWorkflowError extends Error {
	constructor(
		message = 'Workflow execution was cancelled',
		public readonly executionId: string,
	) {
		super(message)
		this.name = 'CancelledWorkflowError'
	}
}

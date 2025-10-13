/** Error thrown when a node fails during execution. */
export class NodeExecutionError extends Error {
	constructor(
		message: string,
		public readonly nodeId: string,
		public readonly blueprintId: string,
		public readonly originalError?: Error,
		public readonly executionId?: string,
	) {
		super(message)
		this.name = 'NodeExecutionError'
	}
}

/** Error thrown when a workflow is gracefully aborted. */
export class CancelledWorkflowError extends Error {
	constructor(message = 'Workflow execution was cancelled.', public readonly executionId?: string) {
		super(message)
		this.name = 'CancelledWorkflowError'
	}
}

/** Error thrown for a non-recoverable failure that should halt the workflow immediately. */
export class FatalNodeExecutionError extends NodeExecutionError {
	constructor(
		message: string,
		nodeId: string,
		blueprintId: string,
		originalError?: Error,
		executionId?: string,
	) {
		super(message, nodeId, blueprintId, originalError, executionId)
		this.name = 'FatalNodeExecutionError'
	}
}

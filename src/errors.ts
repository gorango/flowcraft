/**
 * Error thrown when a workflow is aborted via an AbortSignal.
 */
export class AbortError extends Error {
	constructor(message = 'Workflow aborted') {
		super(message)
		this.name = 'AbortError'
	}
}

/**
 * Custom error class for failures within the workflow, providing additional context.
 */
export class WorkflowError extends Error {
	constructor(
		message: string,
		public readonly nodeName: string,
		public readonly phase: 'prep' | 'exec' | 'post',
		public readonly originalError?: Error,
	) {
		super(message)
		this.name = 'WorkflowError'
		if (originalError?.stack)
			this.stack = `${this.stack}\nCaused by: ${originalError.stack}`
	}
}

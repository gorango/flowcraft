/**
 * Error thrown when a workflow is gracefully aborted via an `AbortSignal`.
 * This error is caught by the execution engine to halt the flow.
 */
export class AbortError extends Error {
	constructor(message = 'Workflow aborted') {
		super(message)
		this.name = 'AbortError'
	}
}

/**
 * A custom error class for failures within a workflow, providing additional
 * context about where and when the error occurred.
 */
export class WorkflowError extends Error {
	/**
	 * @param message The error message.
	 * @param nodeName The name of the `Node` class where the error occurred.
	 * @param phase The lifecycle phase (`'prep'`, `'exec'`, or `'post'`) where the error was thrown.
	 * @param originalError The underlying error that was caught and wrapped.
	 */
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

/**
 * An error thrown by a node to indicate a non-recoverable failure.
 *
 * When an executor catches this error, it should immediately terminate the
 * entire workflow run, bypassing any remaining retries, fallbacks, or
 * subsequent nodes in the graph.
 */
export class FatalWorkflowError extends WorkflowError {
	constructor(
		message: string,
		nodeName: string,
		phase: 'prep' | 'exec' | 'post',
		originalError?: Error,
	) {
		super(message, nodeName, phase, originalError)
		this.name = 'FatalWorkflowError'
	}
}

/**
 * A single, comprehensive error class for the framework.
 * Use this for all errors to ensure consistent structure and easy debugging.
 */
export class FlowcraftError extends Error {
	public readonly message: string
	public readonly nodeId?: string
	public readonly blueprintId?: string
	public readonly executionId?: string
	public readonly isFatal: boolean

	constructor(
		message: string,
		options: {
			cause?: Error
			nodeId?: string
			blueprintId?: string
			executionId?: string
			isFatal?: boolean
		} = {},
	) {
		// Pass the cause to the parent Error constructor for proper chaining
		super(message, { cause: options.cause })
		this.name = 'FlowcraftError'
		this.message = message

		this.nodeId = options.nodeId
		this.blueprintId = options.blueprintId
		this.executionId = options.executionId
		this.isFatal = options.isFatal ?? false
	}
}

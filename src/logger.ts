/**
 * Defines the interface for a logger that can be used by the workflow engine.
 */
export interface Logger {
	debug: (message: string, context?: object) => void
	info: (message: string, context?: object) => void
	warn: (message: string, context?: object) => void
	error: (message: string, context?: object) => void
}

/**
 * A default logger implementation that writes to the console.
 */
export class ConsoleLogger implements Logger {
	private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: object) {
		const fullMessage = `[${level.toUpperCase()}] ${message}`
		if (context && Object.keys(context).length > 0)
			console[level](fullMessage, context)
		else
			console[level](fullMessage)
	}

	debug(message: string, context?: object) { this.log('debug', message, context) }
	info(message: string, context?: object) { this.log('info', message, context) }
	warn(message: string, context?: object) { this.log('warn', message, context) }
	error(message: string, context?: object) { this.log('error', message, context) }
}

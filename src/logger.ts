/**
 * Defines the interface for a logger that can be used by the workflow engine.
 * This allows for plugging in any logging library (e.g., Pino, Winston).
 */
export interface Logger {
	debug: (message: string, context?: object) => void
	info: (message: string, context?: object) => void
	warn: (message: string, context?: object) => void
	error: (message: string, context?: object) => void
}

/**
 * A logger implementation that performs no action (a "no-op" logger).
 * This is the default logger used by the framework if none is provided,
 * making Flowcraft silent out-of-the-box.
 */
export class NullLogger implements Logger {
	debug() { /* no-op */ }
	info() { /* no-op */ }
	warn() { /* no-op */ }
	error() { /* no-op */ }
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const levelPriorities: Record<LogLevel, number> = {
	debug: 1,
	info: 2,
	warn: 3,
	error: 4,
}

/**
 * A default logger implementation that writes messages to the `console`.
 * It supports a minimum log level to control verbosity.
 */
export class ConsoleLogger implements Logger {
	private minLevel: LogLevel

	/**
	 * @param options Configuration for the logger.
	 * @param options.level The minimum level of messages to log. Defaults to 'info'.
	 */
	constructor(options: { level?: LogLevel } = {}) {
		this.minLevel = options.level ?? 'info'
	}

	private log(level: LogLevel, message: string, context?: object) {
		if (levelPriorities[level] < levelPriorities[this.minLevel]) {
			return
		}

		const fullMessage = `[${level.toUpperCase()}] ${message}`
		if (context && Object.keys(context).length > 0) {
			const logMethod = console[level] || console.log
			logMethod(fullMessage, context)
		}
		else {
			const logMethod = console[level] || console.log
			logMethod(fullMessage)
		}
	}

	debug(message: string, context?: object) { this.log('debug', message, context) }
	info(message: string, context?: object) { this.log('info', message, context) }
	warn(message: string, context?: object) { this.log('warn', message, context) }
	error(message: string, context?: object) { this.log('error', message, context) }
}

import type { Logger } from '../logger'
import process from 'node:process'
import { ConsoleLogger, NullLogger } from '../logger'

/**
 * A special logger for testing that can be toggled via an environment variable.
 * If `process.env.VITEST_LOGS` is set to 'true', it will use a ConsoleLogger.
 * Otherwise, it will use a NullLogger, keeping test output clean.
 */
export class DebugLogger implements Logger {
	private internalLogger: Logger

	constructor() {
		if (process.env.VITEST_LOGS === 'true') {
			this.internalLogger = new ConsoleLogger({ level: 'debug' })
		}
		else {
			this.internalLogger = new NullLogger()
		}
	}

	debug(message: string, context?: object) {
		this.internalLogger.debug(message, context)
	}

	info(message: string, context?: object) {
		this.internalLogger.info(message, context)
	}

	warn(message: string, context?: object) {
		this.internalLogger.warn(message, context)
	}

	error(message: string, context?: object) {
		this.internalLogger.error(message, context)
	}
}

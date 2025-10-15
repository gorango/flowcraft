import type { ILogger } from './types'

/** A logger implementation that outputs to the console. */
export class ConsoleLogger implements ILogger {
	debug(message: string, meta?: Record<string, any>): void {
		console.debug(`[DEBUG] ${message}`, meta || '')
	}

	info(message: string, meta?: Record<string, any>): void {
		console.info(`[INFO] ${message}`, meta || '')
	}

	warn(message: string, meta?: Record<string, any>): void {
		console.warn(`[WARN] ${message}`, meta || '')
	}

	error(message: string, meta?: Record<string, any>): void {
		console.error(`[ERROR] ${message}`, meta || '')
	}
}

/** A logger implementation that does nothing (no-op). */
export class NullLogger implements ILogger {
	debug(_message: string, _meta?: Record<string, any>): void {}
	info(_message: string, _meta?: Record<string, any>): void {}
	warn(_message: string, _meta?: Record<string, any>): void {}
	error(_message: string, _meta?: Record<string, any>): void {}
}

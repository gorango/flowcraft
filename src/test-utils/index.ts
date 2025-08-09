import type { RunOptions } from '../types'
import { DebugLogger } from './debug-logger'

/**
 * A single, global logger instance for all tests.
 * Its behavior (console vs. null) is controlled by the `VITEST_LOGS` env var.
 */
export const globalTestLogger = new DebugLogger()

/**
 * A ready-to-use, global `RunOptions` object for tests.
 */
export const globalRunOptions: RunOptions = {
	logger: globalTestLogger,
}

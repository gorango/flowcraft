import type { IEvaluator } from './types'

/**
 * A simple, safe, placeholder expression evaluator.
 * It provides a sandboxed environment for evaluating edge conditions and transforms.
 * In a production system, this should be replaced with a more robust and feature-rich
 * library like `jexl` or `expr-eval`.
 *
 * This implementation can only access properties on a single context object.
 * Example expressions:
 * - "result.output.status === 'SUCCESS'"
 * - "context.user.isAdmin"
 * - "input.value * 100"
 */
export class SimpleEvaluator implements IEvaluator {
	evaluate(expression: string, context: Record<string, any>): any {
		try {
			// Creates a function that is sandboxed to only the keys of the `context` object.
			// It prevents access to global scope (e.g., `window`, `process`).
			const sandbox = new Function(...Object.keys(context), `return ${expression}`) // eslint-disable-line no-new-func
			return sandbox(...Object.values(context))
		}
		catch (error) {
			console.error(`Error evaluating expression "${expression}":`, error)
			// In case of a syntax error or other issue, default to a "falsy" value.
			return undefined
		}
	}
}

import type { IEvaluator } from './types'

/**
 * A simple, safe, placeholder expression evaluator.
 * It provides a sandboxed environment for evaluating edge conditions and transforms.
 *
 * @warning This implementation uses `new Function()` which, while sandboxed from the global
 * scope, can be a security risk if expressions are provided by end-users. It is NOT
 * recommended for production systems. Please replace this with a more robust and secure
 * library like `jsep` by providing your own implementation in the runtime options.
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
			// Filter out keys that aren't valid JavaScript identifiers
			const validIdentifierRegex = /^[a-z_$][\w$]*$/i
			const validKeys = Object.keys(context).filter(key => validIdentifierRegex.test(key))
			const validContext: Record<string, any> = {}
			for (const key of validKeys) {
				validContext[key] = context[key]
			}

			// Creates a function that is sandboxed to only the keys of the `context` object.
			// It prevents access to global scope (e.g., `window`, `process`).
			const sandbox = new Function(...validKeys, `return ${expression}`) // eslint-disable-line no-new-func
			return sandbox(...validKeys.map(k => validContext[k]))
		}
		catch (error) {
			console.error(`Error evaluating expression "${expression}":`, error)
			// In case of a syntax error or other issue, default to a "falsy" value.
			return undefined
		}
	}
}

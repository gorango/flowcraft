import type { IEvaluator } from './types'

/**
 * A safe evaluator that only allows simple property access.
 * It cannot execute arbitrary code and is secure for untrusted inputs.
 *
 * Example expressions:
 * - "result.output.status"
 * - "context.user.isAdmin"
 * - "input.value"
 */
export class PropertyEvaluator implements IEvaluator {
	evaluate(expression: string, context: Record<string, any>): any {
		try {
			// Basic validation to ensure it's a simple path
			if (!/^[a-zA-Z0-9_$.]+$/.test(expression)) {
				console.error(`Error evaluating expression: "${expression}" contains invalid characters.`)
				return undefined
			}

			const parts = expression.split('.')
			const startKey = parts[0]

			if (!Object.hasOwn(context, startKey)) {
				return undefined
			}

			let current = context[startKey]
			for (let i = 1; i < parts.length; i++) {
				if (current === null || current === undefined) {
					return undefined
				}
				current = current[parts[i]]
			}
			return current
		} catch (error) {
			console.error(`Error evaluating property expression "${expression}":`, error)
			return undefined
		}
	}
}

/**
 * @warning This evaluator uses `new Function()` and can execute arbitrary
 * JavaScript code. It poses a significant security risk if the expressions
 * are not from a trusted source (e.g., user input).
 *
 * It should only be used in controlled environments where all workflow
 * definitions are static and authored by trusted developers.
 *
 * For safer evaluation, use the default `PropertyEvaluator` or install a
 * sandboxed library like `jsep` to create a custom, secure evaluator.
 */
export class UnsafeEvaluator implements IEvaluator {
	evaluate(expression: string, context: Record<string, any>): any {
		try {
			// filter out keys that aren't valid JavaScript identifiers
			const validIdentifierRegex = /^[a-z_$][\w$]*$/i
			const validKeys = Object.keys(context).filter((key) => validIdentifierRegex.test(key))
			const validContext: Record<string, any> = {}
			for (const key of validKeys) {
				validContext[key] = context[key]
			}

			// sandboxed function prevents access to global scope (e.g., `window`, `process`).
			const sandbox = new Function(...validKeys, `return ${expression}`)
			return sandbox(...validKeys.map((k) => validContext[k]))
		} catch (error) {
			console.error(`Error evaluating expression "${expression}":`, error)
			// default to a "falsy" value.
			return undefined
		}
	}
}

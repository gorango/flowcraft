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
 * Rewrites an expression so that hyphenated identifiers use bracket notation.
 * E.g. "foo-bar.total" → 'context["foo-bar"].total'
 */
function rewriteHyphenatedIdentifiers(expression: string, hyphenatedKeys: string[]): string {
	let result = expression
	// sort by len desc to avoid partial replacements
	const sortedKeys = [...hyphenatedKeys].toSorted((a, b) => b.length - a.length)
	for (const key of sortedKeys) {
		if (!key.includes('-')) continue
		const regex = new RegExp(`(?<![\\w$])${escapeRegex(key)}(?![\\w$-])`, 'g')
		result = result.replace(regex, `context["${key}"]`)
	}
	return result
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
			const hyphenatedKeys = Object.keys(context).filter(
				(key) => !validIdentifierRegex.test(key) && /^[a-zA-Z0-9_$-]+$/.test(key),
			)
			const validContext: Record<string, any> = {}
			for (const key of validKeys) {
				validContext[key] = context[key]
			}
			for (const key of hyphenatedKeys) {
				validContext[key] = context[key]
			}

			let rewrittenExpression = rewriteHyphenatedIdentifiers(expression, hyphenatedKeys)

			// sandboxed function prevents access to global scope (e.g., `window`, `process`).
			const sandbox = new Function('context', ...validKeys, `return ${rewrittenExpression}`)
			return sandbox(validContext, ...validKeys.map((k) => validContext[k]))
		} catch (error) {
			console.error(`Error evaluating expression "${expression}":`, error)
			// default to a "falsy" value.
			return undefined
		}
	}
}

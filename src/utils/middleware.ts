import type { Middleware, MiddlewareNext, NodeArgs } from '../types'
import type { AbstractNode } from '../workflow/index'

/**
 * Composes a chain of middleware functions around a node's execution.
 * @internal
 */
export function applyMiddleware<T = any>(middleware: Middleware<T>[], nodeToRun: AbstractNode): MiddlewareNext<T> {
	const runNode: MiddlewareNext<T> = (args: NodeArgs) => {
		return nodeToRun._run({
			...args,
			params: { ...args.params, ...nodeToRun.params },
		})
	}

	if (!middleware || middleware.length === 0)
		return runNode

	// Build the chain backwards, so the first middleware in the array is the outermost.
	return middleware.reduceRight<MiddlewareNext<T>>(
		(next, mw) => (args: NodeArgs) => mw(args, next),
		runNode,
	)
}

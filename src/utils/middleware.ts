import type { Middleware, MiddlewareNext, NodeArgs } from '../types'
import type { AbstractNode } from '../workflow'

/**
 * Composes a chain of middleware functions around a node's execution.
 * @internal
 */
export function applyMiddleware<T = any>(middleware: Middleware<T>[], nodeToRun: AbstractNode): MiddlewareNext<T> {
	// The final function in the chain is the actual execution of the node.
	const runNode: MiddlewareNext<T> = (args: NodeArgs) => {
		return nodeToRun._run({
			ctx: args.ctx,
			params: { ...args.params, ...nodeToRun.params },
			signal: args.signal,
			logger: args.logger,
			executor: args.executor,
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

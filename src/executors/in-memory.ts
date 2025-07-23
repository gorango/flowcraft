import type { IExecutor } from '../executor'
import type { AbstractNode, Context, Flow, Logger, Middleware, MiddlewareNext, NodeArgs, RunOptions } from '../workflow'
import { NullLogger } from '../workflow'

/**
 * The default executor that runs a workflow within a single, in-memory process.
 * This preserves the original, lightweight behavior of the framework.
 */
export class InMemoryExecutor implements IExecutor {
	public async run(flow: Flow, context: Context, options?: RunOptions): Promise<any> {
		const logger = options?.logger ?? new NullLogger()
		const params = { ...flow.params, ...options?.params }
		return flow._run(context, params, options?.controller?.signal, logger, this)
	}

	public getNextNode(curr: AbstractNode, action: any, logger: Logger): AbstractNode | undefined {
		const nextNode = curr.successors.get(action)
		const actionDisplay = typeof action === 'symbol' ? action.toString() : action
		if (nextNode) {
			logger.debug(`Action '${actionDisplay}' from ${curr.constructor.name} leads to ${nextNode.constructor.name}`, { action })
		}
		else if (curr.successors.size > 0 && action !== undefined && action !== null) {
			logger.info(`Flow ends: Action '${actionDisplay}' from ${curr.constructor.name} has no configured successor.`)
		}
		return nextNode
	}

	public applyMiddleware(middleware: Middleware[], nodeToRun: AbstractNode): MiddlewareNext {
		const runNode: MiddlewareNext = (args: NodeArgs) => {
			return nodeToRun._run(args.ctx, { ...args.params, ...nodeToRun.params }, args.signal, args.logger, args.executor)
		}

		if (!middleware || middleware.length === 0) {
			return runNode
		}

		return middleware.reduceRight<MiddlewareNext>(
			(next, mw) => (args: NodeArgs) => mw(args, next),
			runNode,
		)
	}
}

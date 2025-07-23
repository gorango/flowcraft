import type { IExecutor } from '../executor'
import type { AbstractNode, Context, Flow, Logger, Middleware, MiddlewareNext, NodeArgs, RunOptions } from '../workflow'
import { AbortError, NullLogger } from '../workflow'

/**
 * The default executor that runs a workflow within a single, in-memory process.
 * This class contains the core logic for traversing a workflow graph.
 */
export class InMemoryExecutor implements IExecutor {
	/**
	 * Executes a given flow with a specific context and options.
	 * This is the main entry point for the in-memory execution engine.
	 * @param flow The Flow instance to execute.
	 * @param context The shared context for the workflow.
	 * @param options Runtime options, including a logger, abort controller, or initial params.
	 * @returns A promise that resolves with the final action of the workflow.
	 */
	public async run(flow: Flow, context: Context, options?: RunOptions): Promise<any> {
		const logger = options?.logger ?? new NullLogger()
		const controller = options?.controller
		const combinedParams = { ...flow.params, ...options?.params }

		// This handles "logic-bearing" flows like BatchFlow that don't have a graph.
		if (!flow.startNode) {
			logger.info(`Executor is running a logic-bearing flow: ${flow.constructor.name}`)
			const chain = this.applyMiddleware(flow.middleware, flow)
			const nodeArgs: NodeArgs = {
				ctx: context,
				params: combinedParams,
				signal: controller?.signal,
				logger,
				prepRes: undefined,
				execRes: undefined,
				name: flow.constructor.name,
				executor: this,
			}
			return await chain(nodeArgs)
		}

		logger.info(`Executor is running flow graph: ${flow.constructor.name}`)
		let curr: AbstractNode | undefined = flow.startNode
		let lastAction: any

		while (curr) {
			if (controller?.signal.aborted)
				throw new AbortError()

			const chain = this.applyMiddleware(flow.middleware, curr)
			const nodeArgs: NodeArgs = {
				ctx: context,
				params: combinedParams,
				signal: controller?.signal,
				logger,
				prepRes: undefined,
				execRes: undefined,
				name: curr.constructor.name,
				executor: this,
			}
			lastAction = await chain(nodeArgs)
			const previousNode = curr
			curr = this.getNextNode(previousNode, lastAction, logger)
		}
		return lastAction
	}

	/**
	 * Determines the next node to execute based on the action returned by the current node.
	 * @param curr The node that just finished executing.
	 * @param action The action string returned by the node.
	 * @param logger The logger instance.
	 * @returns The next `AbstractNode` to run, or `undefined` if the flow branch ends.
	 */
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

	/**
	 * Composes a chain of middleware functions around a node's execution.
	 * @param middleware An array of middleware functions.
	 * @param nodeToRun The node whose execution will be wrapped.
	 * @returns A `MiddlewareNext` function that represents the start of the composed chain.
	 */
	public applyMiddleware(middleware: Middleware[], nodeToRun: AbstractNode): MiddlewareNext {
		// The final function in the chain is the actual execution of the node.
		const runNode: MiddlewareNext = (args: NodeArgs) => {
			return nodeToRun._run(args.ctx, { ...args.params, ...nodeToRun.params }, args.signal, args.logger, args.executor)
		}

		if (!middleware || middleware.length === 0)
			return runNode

		// Build the chain backwards, so the first middleware in the array is the outermost.
		return middleware.reduceRight<MiddlewareNext>(
			(next, mw) => (args: NodeArgs) => mw(args, next),
			runNode,
		)
	}
}

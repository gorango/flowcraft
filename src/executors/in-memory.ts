import type { Context } from '../context'
import type { Logger } from '../logger'
import type { Middleware, NodeArgs, RunOptions } from '../types'
import type { AbstractNode, Flow } from '../workflow'
import type { IExecutor, InternalRunOptions } from './types'
import { AbortError } from '../errors'
import { NullLogger } from '../logger'
import { applyMiddleware } from '../utils/middleware'

/**
 * The default executor that runs a workflow within a single, in-memory process.
 * This class contains the core logic for traversing a workflow graph, applying middleware,
 * and handling node execution.
 */
export class InMemoryExecutor implements IExecutor {
	/**
	 * A stateless, reusable method that orchestrates the traversal of a graph.
	 * It is called by `run()` for top-level flows and by `Flow.exec()` for sub-flows.
	 * @param startNode The node where the graph traversal begins.
	 * @param flowMiddleware The middleware array from the containing flow.
	 * @param context The shared workflow context.
	 * @param options The internal, normalized run options.
	 * @returns The final action from the last executed node in the graph.
	 * @internal
	 */
	public async _orch<T = any>(
		startNode: AbstractNode,
		flowMiddleware: Middleware[],
		context: Context,
		options: InternalRunOptions,
	): Promise<T> {
		let currentNode: AbstractNode | undefined = startNode
		let nextNode: AbstractNode | undefined
		let action: any

		const { logger, signal } = options

		while (currentNode) {
			if (signal?.aborted)
				throw new AbortError()

			const nodeArgs: NodeArgs = {
				ctx: context,
				params: { ...options.params, ...currentNode.params },
				signal,
				logger,
				prepRes: undefined,
				execRes: undefined,
				name: currentNode.constructor.name,
				executor: options.executor,
				node: currentNode,
			}

			const chain = applyMiddleware(flowMiddleware, currentNode)
			action = await chain(nodeArgs)
			nextNode = this.getNextNode(currentNode, action)

			if (!nextNode)
				return action as T

			currentNode = nextNode
		}

		return undefined as T
	}

	/**
	 * Executes a given flow with a specific context and options.
	 * This is the main entry point for the in-memory execution engine.
	 * @param flow The Flow instance to execute.
	 * @param context The shared context for the workflow.
	 * @param options Runtime options, including a logger, abort controller, or initial params.
	 * @returns A promise that resolves with the final action of the workflow.
	 */
	public run<T>(flow: Flow<any, T>, context: Context, options?: RunOptions): Promise<T>
	public run(flow: Flow, context: Context, options?: RunOptions): Promise<any>
	public async run<T>(flow: Flow<any, T>, context: Context, options?: RunOptions): Promise<T> {
		const logger = options?.logger ?? new NullLogger()
		const combinedParams = { ...flow.params, ...options?.params }

		const internalOptions: InternalRunOptions = {
			logger,
			signal: options?.signal ?? options?.controller?.signal,
			params: combinedParams,
			executor: this,
		}

		if (!flow.startNode) {
			logger.info(`Executor is running a logic-bearing flow: ${flow.constructor.name}`)
			const chain = applyMiddleware(flow.middleware, flow)
			return await chain({
				...internalOptions,
				ctx: context,
				prepRes: undefined,
				execRes: undefined,
				name: flow.constructor.name,
			})
		}

		return this._orch<T>(flow.startNode, flow.middleware, context, internalOptions)
	}

	/**
	 * Determines the next node to execute based on the action returned by the current node.
	 * @internal
	 */
	public getNextNode(curr: AbstractNode, action: any): AbstractNode | undefined {
		const nextNodes = curr.successors.get(action)
		// For the in-memory executor, we take the first successor for a given action.
		// Parallelism is handled by specific container nodes like ParallelFlow.
		return nextNodes?.[0]
	}
}

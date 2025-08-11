import type { Context } from '../context'
import type { Logger } from '../logger'
import type { Params, RunOptions } from '../types'
import type { AbstractNode, Flow } from '../workflow/index'

/**
 * Defines the contract for a workflow execution engine.
 * An executor is responsible for taking a `Flow` definition and running it,
 * orchestrating the traversal of the node graph.
 */
export interface IExecutor {
	/**
	 * Executes a given flow with a specific context and options.
	 * @param flow The `Flow` instance to execute.
	 * @param context The shared `Context` for the workflow run.
	 * @param options Runtime options, which can include a logger, abort controller, or initial params.
	 * @returns A promise that resolves with the final action of the workflow, or another result
	 * depending on the executor's implementation (e.g., a job ID for a distributed executor).
	 */
	run: <T>(flow: Flow<any, T>, context: Context, options?: RunOptions) => Promise<T>
	/**
	 * Determines the next node to execute based on the action returned by the current node.
	 * @param curr The current node.
	 * @param action The action returned by the current node.
	 * @returns The next node to execute, or undefined if no further action is required.
	 */
	getNextNode: (curr: AbstractNode, action: any) => AbstractNode | undefined
}

/**
 * Internal, normalized run options used by executors.
 * @internal
 */
export interface InternalRunOptions {
	logger: Logger
	signal?: AbortSignal
	params: Params
	executor: IExecutor
}

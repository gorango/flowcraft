import type { Context, Flow, Logger, Params, RunOptions } from '../workflow'

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

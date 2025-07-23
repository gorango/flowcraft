import type { Context, Flow, RunOptions } from './workflow'

/**
 * Defines the interface for a workflow executor.
 * An executor is responsible for taking a Flow definition and running it.
 */
export interface IExecutor {
	/**
	 * Executes a given flow with a specific context and options.
	 * @param flow The Flow instance to execute.
	 * @param context The shared context for the workflow.
	 * @param options Runtime options, which can include a logger or abort controller.
	 * @returns A promise that resolves with the final action of the workflow.
	 */
	run: (flow: Flow, context: Context, options?: RunOptions) => Promise<any>
}

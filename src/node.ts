/** eslint-disable unused-imports/no-unused-vars */

import type { NodeContext, NodeResult, RuntimeDependencies } from './types'

/**
 * A structured, class-based node for complex logic with a safe, granular lifecycle.
 * This class is generic, allowing implementations to specify the exact context
 * and dependency types they expect.
 */
export abstract class BaseNode<
	TContext extends Record<string, any> = Record<string, any>,
	TDependencies extends RuntimeDependencies = RuntimeDependencies,
> {
	/**
	 * @param params Static parameters for this node instance, passed from the blueprint.
	 */
	constructor(protected params: Record<string, any>) { }

	/**
	 * Phase 1: Gathers and prepares data for execution. This phase is NOT retried on failure.
	 * @param context The node's execution context.
	 * @returns The data needed for the `exec` phase.
	 */
	async prep(context: NodeContext<TContext, TDependencies>): Promise<any> {
		return context.input
	}

	/**
	 * Phase 2: Performs the core, isolated logic. This is the ONLY phase that is retried.
	 * @param prepResult The data returned from the `prep` phase.
	 * @param context The node's execution context.
	 */
	abstract exec(prepResult: any, context: NodeContext<TContext, TDependencies>): Promise<Omit<NodeResult, 'error'>>

	/**
	 * Phase 3: Processes the result and saves state. This phase is NOT retried.
	 * @param execResult The successful result from the `exec` or `fallback` phase.
	 * @param _context The node's execution context.
	 */
	async post(execResult: Omit<NodeResult, 'error'>, _context: NodeContext<TContext, TDependencies>): Promise<NodeResult> {
		return execResult
	}

	/**
	 * An optional safety net that runs if all `exec` retries fail.
	 * @param error The final error from the last `exec` attempt.
	 * @param _context The node's execution context.
	 */
	async fallback(error: Error, _context: NodeContext<TContext, TDependencies>): Promise<Omit<NodeResult, 'error'>> {
		// By default, re-throw the error, failing the node.
		throw error
	}
}

import type { Context } from '../context'
import type { NodeArgs, Params } from '../types'
import { Node } from './Node'

/**
 * A simplified base class for nodes that only need to perform a core action.
 * This pattern is ideal for nodes that receive their inputs via `params` and
 * produce an output, without needing `prep` or complex `post` branching logic.
 *
 * @template ExecRes The type of data returned by the `exec` phase.
 * @template TParams The type for the node's static parameters.
 */
export abstract class ExecNode<
	ExecRes = any,
	TParams extends Params = Params,
	TContext extends Context = Context,
> extends Node<void, ExecRes, any, TParams, TContext> {
	/**
	 * (Lifecycle) Performs the core, isolated logic of the node.
	 * This is the only phase that is retried on failure. It should not access the `Context` directly.
	 * @param args The arguments for the node, including `prepRes`.
	 * @returns The result of the execution.
	 */
	abstract override exec(args: NodeArgs<void, void, TParams, TContext>): Promise<ExecRes>
}

/**
 * A simplified base class for nodes that only perform a side effect, such as
 * modifying the `Context` or logging. These nodes do not produce an `exec` result.
 * Their logic is typically placed in the `prep` phase.
 *
 * @template TParams The type for the node's static parameters.
 */
export abstract class PreNode<
	TParams extends Params = Params,
	TContext extends Context = Context,
> extends Node<void, void, any, TParams, TContext> {
	/**
	 * (Lifecycle) Prepares data or performs a side effect. Runs once before `exec`.
	 * This is the ideal place to read from or write to the `Context`.
	 * @param args The arguments for the node, including `ctx` and `params`.
	 */
	abstract override prep(args: NodeArgs<void, void, TParams, TContext>): Promise<void>
}

/**
 * A simplified base class for nodes that make a branching decision.
 * This pattern is ideal for routing the workflow based on data in the `Context`.
 * The branching logic is placed in the `post` phase, which returns a custom action string.
 *
 * @template PostRes The type of the "action" string returned by the `post` phase.
 * @template TParams The type for the node's static parameters.
 */
export abstract class PostNode<
	PostRes = any,
	TParams extends Params = Params,
	TContext extends Context = Context,
> extends Node<void, void, PostRes, TParams, TContext> {
	/**
	 * (Lifecycle) Processes results and determines the next step. Runs once after `exec`.
	 * This is the ideal place to write data to the `Context` and return an action.
	 * @param args The arguments for the node, including `execRes`.
	 * @returns An "action" string to determine which successor to execute next.
	 */
	abstract override post(args: NodeArgs<void, void, TParams, TContext>): Promise<PostRes>
}

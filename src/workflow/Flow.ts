import type { Context } from '../context'
import type { InternalRunOptions } from '../executors/types'
import type { Middleware, NodeArgs, Params, RunOptions } from '../types'
import type { AbstractNode } from './AbstractNode'
import { InMemoryExecutor } from '../executors/in-memory'
import { Node } from './Node'
import { registerFlow } from './registry'

/**
 * A special type of `Node` that orchestrates a graph of other nodes.
 * It can contain its own middleware and can be composed within other flows.
 *
 * @template PrepRes The type of data returned by the `prep` phase.
 * @template ExecRes The type of data returned by the `exec` phase (the final action).
 * @template TParams The type for the flow's static parameters.
 */
export class Flow<
	PrepRes = any,
	ExecRes = any,
	TParams extends Params = Params,
	TContext extends Context = Context,
> extends Node<PrepRes, ExecRes, ExecRes, TParams, TContext> {
	/** The first node to be executed in this flow's graph. */
	public startNode?: AbstractNode<any, any>
	/** An array of middleware functions to be applied to every node within this flow. */
	public middleware: Middleware[] = []

	/**
	 * @param start An optional node to start the flow with.
	 */
	constructor(start?: AbstractNode<any, any, TContext>) {
		super()
		this.startNode = start
	}

	protected _wrapError(e: any, phase: 'prep' | 'exec' | 'post'): Error {
		if (phase === 'exec') {
			// Errors from a sub-flow's orchestration are already wrapped, so we pass them through.
			return e
		}
		return super._wrapError(e, phase)
	}

	/**
	 * Adds a middleware function to this flow. Middleware will be executed in the
	 * order it is added, wrapping the execution of every node within this flow.
	 * @param fn The middleware function to add.
	 * @returns The `Flow` instance for chaining.
	 */
	public use(fn: Middleware): this {
		this.middleware.push(fn)
		return this
	}

	/**
	 * Sets the starting node of the flow's graph.
	 * @param start The node to start with.
	 * @returns The start node instance, allowing for further chaining (`.next()`).
	 */
	start<StartNode extends AbstractNode<any, any, TContext>>(start: StartNode): StartNode {
		this.startNode = start
		return start
	}

	/**
	 * (Lifecycle) Executes this flow's internal graph when it is used as a sub-flow
	 * (a node within a larger flow).
	 * @internal
	 * @param args The arguments for the node, passed down from the parent executor.
	 * @returns The final action returned by the last node in this flow's graph.
	 */
	async exec(args: NodeArgs<any, any, TParams, TContext>): Promise<ExecRes> {
		// For programmatic composition, a Flow node orchestrates its own graph.
		// This is a feature of the InMemoryExecutor. Distributed systems should
		// rely on pre-flattened graphs produced by the GraphBuilder.
		if (!(args.executor instanceof InMemoryExecutor)) {
			throw new TypeError('Programmatic sub-flow execution is only supported by the InMemoryExecutor. For other environments, use GraphBuilder to create a single, flattened workflow.')
		}

		if (!this.startNode) {
			// This handles logic-bearing flows like BatchFlow that override exec directly.
			return super.exec(args)
		}

		const combinedParams = { ...args.params, ...this.params }
		const internalOptions: InternalRunOptions = {
			logger: args.logger,
			signal: args.signal,
			params: combinedParams,
			executor: args.executor,
		}

		const finalAction = await args.executor._orch<ExecRes>(
			this.startNode,
			this.middleware,
			args.ctx,
			internalOptions,
		)

		return finalAction as ExecRes
	}

	/**
	 * (Lifecycle) The post-execution step for a `Flow` node. It simply passes through
	 * the final action from its internal graph execution (`execRes`).
	 * @internal
	 */
	async post({ execRes }: NodeArgs<PrepRes, ExecRes, TParams, TContext>): Promise<ExecRes> {
		return execRes
	}

	/**
	 * Runs the entire flow as a top-level entry point.
	 * @param ctx The shared workflow context.
	 * @param options Runtime options like a logger, abort controller, or a custom executor.
	 * @returns The final action returned by the last node in the flow.
	 */
	async run(ctx: TContext, options?: RunOptions): Promise<ExecRes> {
		const executor = options?.executor ?? new InMemoryExecutor()
		return executor.run(this, ctx, options)
	}

	/**
	 * Finds a node within the flow's graph by its unique ID.
	 *
	 * This method performs a breadth-first search starting from the `startNode`.
	 * It is a convenient way to get a reference to a specific node instance
	 * for debugging or dynamic modifications.
	 *
	 * @remarks
	 * This performs a graph traversal on each call, which has a time complexity
	 * proportional to the number of nodes and edges in the graph (O(V+E)). For
	 * performance-critical applications or flows built with `GraphBuilder`,
	 * it is more efficient to use the `nodeMap` returned by `GraphBuilder.build()`.
	 *
	 * @param id The unique ID of the node to find (set via `.withId()` or by the `GraphBuilder`).
	 * @returns The `AbstractNode` instance if found, otherwise `undefined`.
	 */
	public getNodeById(id: string | number): AbstractNode<any, any, TContext> | undefined {
		if (!this.startNode)
			return undefined

		const queue: AbstractNode<any, any, TContext>[] = [this.startNode]
		const visited = new Set<AbstractNode<any, any, TContext>>([this.startNode])
		while (queue.length > 0) {
			const currentNode = queue.shift()!

			if (currentNode.id === id)
				return currentNode

			for (const successorArray of currentNode.successors.values()) {
				for (const successor of successorArray) {
					if (!visited.has(successor)) {
						visited.add(successor)
						queue.push(successor)
					}
				}
			}
		}

		return undefined
	}

	/**
	 * Retrieves all unique nodes within the flow's graph.
	 * @internal
	 */
	public getAllNodes(): Set<AbstractNode> {
		const allNodes = new Set<AbstractNode>()
		if (!this.startNode)
			return allNodes

		const queue: AbstractNode[] = [this.startNode]
		const visited = new Set<AbstractNode>([this.startNode])
		allNodes.add(this.startNode)

		while (queue.length > 0) {
			const currentNode = queue.shift()!
			for (const successorArray of currentNode.successors.values()) {
				for (const successor of successorArray) {
					if (!visited.has(successor)) {
						visited.add(successor)
						queue.push(successor)
						allNodes.add(successor)
					}
				}
			}
		}
		return allNodes
	}
}

registerFlow(Flow)

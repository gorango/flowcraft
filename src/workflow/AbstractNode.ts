import type { GraphNode } from '../builder/graph/types'
import type { Context } from '../context'
import type { FILTER_FAILED, NodeRunContext, Params } from '../types'
import { DEFAULT_ACTION } from '../types'

/**
 * The abstract base class for all executable units in a workflow.
 * It provides the core structure for connecting nodes into a graph.
 *
 * @template TPostRes The type for the action returned by the node's `post` method.
 * @template TParams The type for the node's static parameters.
 */
export abstract class AbstractNode<
	TPostRes = any,
	TParams extends Params = Params,
	TContext extends Context = Context,
> {
	/** A unique identifier for this node instance, often set by the GraphBuilder. */
	public id?: number | string
	/** A key-value store for static parameters that configure the node's behavior. */
	public params: TParams = {} as TParams
	/** A map of successor nodes, keyed by the action that triggers the transition. */
	public successors = new Map<TPostRes | string | typeof DEFAULT_ACTION | typeof FILTER_FAILED, AbstractNode<any, any, TContext>[]>()
	/** The original graph definition for this node, if created by a GraphBuilder. */
	public graphData?: GraphNode
	/** A flag indicating that this node is a container and should be passed through by distributed executors. */
	public isPassthrough = false

	/**
	 * Sets a unique identifier for this node instance.
	 * Primarily used by the GraphBuilder for wiring and debugging.
	 * @param id The unique ID for the node.
	 * @returns The node instance for chaining.
	 */
	withId(id: number | string): this {
		this.id = id
		return this
	}

	/**
	 * Attaches the original graph definition data to the node instance.
	 * @internal
	 * @param data The graph node definition.
	 * @returns The node instance for chaining.
	 */
	withGraphData(data: GraphNode): this {
		this.graphData = data
		return this
	}

	/**
	 * Sets or merges static parameters for the node. These parameters are available
	 * via `args.params` in the node's lifecycle methods.
	 * @param params The parameters to merge into the node's existing parameters.
	 * @returns The node instance for chaining.
	 */
	withParams(params: Partial<TParams>): this {
		this.params = { ...this.params, ...params }
		return this
	}

	/**
	 * Defines the next node in the sequence for a given action.
	 * This is the primary method for constructing a workflow graph.
	 *
	 * @param node The successor node or nodes to execute next.
	 * @param action The action from this node's `post` method that triggers
	 * the transition. Defaults to `DEFAULT_ACTION` for linear flows.
	 * @returns The successor node instance, allowing for further chaining. If multiple nodes are provided, it returns the first one.
	 */
	next<NextNode extends AbstractNode<any, any>>(
		node: NextNode | NextNode[],
		action: TPostRes | string | typeof DEFAULT_ACTION | typeof FILTER_FAILED = DEFAULT_ACTION as any,
	): NextNode {
		const existing = this.successors.get(action) ?? []
		const newSuccessors = Array.isArray(node) ? node : [node]

		for (const successor of newSuccessors) {
			if (!existing.includes(successor)) {
				existing.push(successor)
			}
		}

		this.successors.set(action, existing)
		return Array.isArray(node) ? node[0] : node
	}

	/**
	 * The internal method that executes the node's full lifecycle.
	 * It is called by an `IExecutor`.
	 * @internal
	 */
	abstract _run(ctx: NodeRunContext<TContext>): Promise<TPostRes>
}

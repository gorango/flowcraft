import type { ContextTransform } from './context'
import type { Context, Flow, Node, NodeArgs } from './workflow'
import { SequenceFlow } from './builder/collection'
import { composeContext } from './context'
import { Node as BaseNode } from './workflow'

/**
 * A type for a pure function that can be executed within a `Node`,
 * typically taking the node's `params` as input.
 * @template TIn The input type, corresponding to `params`.
 * @template TOut The output type, which becomes the node's `execRes`.
 */
export type NodeFunction<TIn = any, TOut = any> = (input: TIn) => TOut | Promise<TOut>

/**
 * A type for a function that operates on the shared `Context` in addition
 * to the node's `params`.
 * @template TIn The input type, corresponding to `params`.
 * @template TOut The output type, which becomes the node's `execRes`.
 */
export type ContextFunction<TIn = any, TOut = any> = (ctx: Context, input: TIn) => TOut | Promise<TOut>

/**
 * Creates a `Node` from a simple, pure function that transforms an input to an output.
 * The node's `params` object is passed as the input to the function.
 *
 * @example
 * const add = (n: number) => mapNode<{ value: number }, number>(params => params.value + n)
 * const add5Node = add(5) // A reusable node that adds 5 to its input parameter.
 *
 * @param fn A function that takes an input object and returns a result.
 * @returns A new `Node` instance that wraps the function.
 */
export function mapNode<TIn, TOut>(fn: NodeFunction<TIn, TOut>): Node<TIn, TOut> {
	return new class extends BaseNode<TIn, TOut> {
		async exec({ params }: NodeArgs<TIn>): Promise<TOut> {
			return fn(params as TIn)
		}
	}()
}

/**
 * Creates a `Node` from a function that requires access to the shared `Context`.
 * Both the `Context` and the node's `params` are passed as arguments to the function.
 *
 * @example
 * const greeter = contextNode((ctx, params: { name: string }) => {
 *   const language = ctx.get(LANGUAGE_KEY) || 'en'
 *   return language === 'en' ? `Hello, ${params.name}` : `Hola, ${params.name}`
 * })
 *
 * @param fn A function that takes the context and an input object, and returns a result.
 * @returns A new `Node` instance that wraps the function.
 */
export function contextNode<TIn, TOut>(fn: ContextFunction<TIn, TOut>): Node<TIn, TOut> {
	return new class extends BaseNode<TIn, TOut> {
		async exec({ ctx, params }: NodeArgs<TIn>): Promise<TOut> {
			return fn(ctx, params as TIn)
		}
	}()
}

/**
 * Creates a `Node` that declaratively applies a series of transformations to the `Context`.
 * This is a "side-effect" node used purely for state management; it does not produce an output.
 *
 * @example
 * const setupUserContext = (userId: string, name: string) => transformNode(
 *   userLens.set(userId),
 *   nameLens.set(name)
 * )
 *
 * @param transforms A sequence of `ContextTransform` functions (e.g., from a lens) to apply.
 * @returns A new `Node` instance that will mutate the context when executed.
 */
export function transformNode(...transforms: ContextTransform[]): Node {
	return new class extends BaseNode {
		async prep({ ctx }: NodeArgs) {
			// Apply the composed transformations directly to the mutable context.
			composeContext(...transforms)(ctx)
		}
	}()
}

/**
 * A functional-style alias for `SequenceFlow`. It constructs a linear workflow
 * where each node executes in the order it is provided.
 *
 * @example
 * const mathPipeline = pipeline(addNode(5), multiplyNode(2))
 *
 * @param nodes A sequence of `Node` instances to chain together.
 * @returns A `Flow` instance representing the linear sequence.
 */
export function pipeline(...nodes: Node[]): Flow {
	return new SequenceFlow(...nodes)
}

/**
 * A classic functional composition utility. It takes two functions, `f` and `g`,
 * and returns a new function that computes `f(g(x))`.
 *
 * This is a general-purpose helper, not a `Node` builder itself, but it can be
 * used to create more complex `NodeFunction`s to pass to `mapNode`.
 *
 * @example
 * const add5 = (x: number) => x + 5
 * const multiply2 = (x: number) => x * 2
 * const add5ThenMultiply2 = compose(multiply2, add5) // equivalent to: x => (x + 5) * 2
 *
 * @param f The outer function, which receives the result of `g`.
 * @param g The inner function, which receives the initial input.
 * @returns A new `NodeFunction` that combines both operations.
 */
export function compose<A, B, C>(f: NodeFunction<B, C>, g: NodeFunction<A, B>): NodeFunction<A, C> {
	return async (input: A) => f(await g(input))
}

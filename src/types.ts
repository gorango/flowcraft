import type { Context } from './context'
import type { IExecutor } from './executor'
import type { Logger } from './logger'

/** A generic type for key-value parameters. */
export type Params = Record<string, any>

/** The default action returned by a node for linear progression. */
export const DEFAULT_ACTION = Symbol('default')

/** The action returned by a `.filter()` node when the predicate fails. */
export const FILTER_FAILED = Symbol('filter_failed')

/**
 * The standard arguments object passed to a node's lifecycle methods.
 * @template PrepRes The type of the `prepRes` property.
 * @template ExecRes The type of the `execRes` property.
 */
export interface NodeArgs<PrepRes = any, ExecRes = any> {
	/** The shared, mutable context for the workflow run. */
	ctx: Context
	/** The static parameters for the node, merged from the node and flow's `withParams`. */
	params: Params
	/** An `AbortController` to gracefully cancel the workflow. */
	controller?: AbortController
	/** An `AbortSignal` for handling cancellation. */
	signal?: AbortSignal
	/** The logger instance for the workflow run. */
	logger: Logger
	/** The result of the `prep` phase. */
	prepRes: PrepRes
	/** The result of the `exec` phase. */
	execRes: ExecRes
	/** The final error object, available only in `execFallback`. */
	error?: Error
	/** The name of the Node's constructor, for logging. */
	name?: string
	/** A reference to the current `IExecutor` running the flow. */
	executor?: IExecutor
}

/**
 * The context object passed to a node's internal `_run` method.
 * @internal
 */
export interface NodeRunContext {
	ctx: Context
	params: Params
	signal?: AbortSignal
	logger: Logger
	executor?: IExecutor
}

/** Options for configuring a `Node` instance. */
export interface NodeOptions {
	/** The total number of times the `exec` phase will be attempted. Defaults to `1`. */
	maxRetries?: number
	/** The time in milliseconds to wait between failed `exec` attempts. Defaults to `0`. */
	wait?: number
}

/** Options for running a top-level `Flow`. */
export interface RunOptions {
	/** An `AbortController` to gracefully cancel the workflow. */
	controller?: AbortController
	/** An `AbortSignal` for handling cancellation. */
	signal?: AbortSignal
	/** A `Logger` instance to receive logs from the execution engine. */
	logger?: Logger
	/** Top-level parameters to be merged into the context for the entire run. */
	params?: Params
	/** A custom `IExecutor` instance to run the workflow. Defaults to `InMemoryExecutor`. */
	executor?: IExecutor
}

/** The function signature for the `next` function passed to middleware. */
export type MiddlewareNext<T = any> = (args: NodeArgs) => Promise<T>
/** The function signature for a middleware function. */
export type Middleware<T = any> = (args: NodeArgs, next: MiddlewareNext<T>) => Promise<T>

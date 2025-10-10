import type { BaseNode } from './node'

// =================================================================================
// Blueprint Interfaces (The Declarative Definition)
// =================================================================================

/** The central, serializable representation of a workflow. */
export interface WorkflowBlueprint {
	id: string
	nodes: NodeDefinition[]
	edges: EdgeDefinition[]
	metadata?: Record<string, any>
}

/** Defines a single step in the workflow. */
export interface NodeDefinition {
	id: string
	/** A key that resolves to an implementation in a registry. */
	uses: string
	/** Static parameters for the node. */
	params?: Record<string, any>
	/** Maps context data to this node's `input`. */
	inputs?: string | Record<string, string>
	/** Configuration for retries, timeouts, etc. */
	config?: NodeConfig
}

/** Defines the connection and data flow between two nodes. */
export interface EdgeDefinition {
	source: string
	target: string
	/** An 'action' from the source node that triggers this edge. */
	action?: string
	/** A condition that must be met for this edge to be taken. */
	condition?: string
	/** A string expression to transform the data before passing it to the target node. */
	transform?: string
}

/** Configuration for a node's resiliency and behavior. */
export interface NodeConfig {
	maxRetries?: number
	retryDelay?: number
	timeout?: number
	/** The `uses` key of another node implementation for fallback. */
	fallback?: string
	/** Determines how a node with multiple incoming edges should be triggered. */
	joinStrategy?: 'all' | 'any'
}

// =================================================================================
// Node Implementation Interfaces
// =================================================================================

/** The required return type for any node implementation. */
export interface NodeResult<TOutput = any> {
	output?: TOutput
	action?: string
	error?: { message: string, [key: string]: any }
}

/** The context object passed to every node's execution logic. */
export interface NodeContext<
	TContext extends Record<string, any> = Record<string, any>,
	TDependencies extends RuntimeDependencies = RuntimeDependencies,
> {
	/** The async-only interface for interacting with the workflow's state. */
	context: IAsyncContext<TContext>
	/** The primary input data for this node, typically from its predecessor. */
	input?: any
	/** Static parameters defined in the blueprint. */
	params: Record<string, any>
	/** Shared, runtime-level dependencies (e.g., database clients, loggers). */
	dependencies: TDependencies
}

/** A simple function-based node implementation. */
export type NodeFunction<
	TContext extends Record<string, any> = Record<string, any>,
	TDependencies extends RuntimeDependencies = RuntimeDependencies,
> = (context: NodeContext<TContext, TDependencies>) => Promise<NodeResult>

/**
 * Represents a constructor for any concrete class that extends the abstract BaseNode.
 * This is the corrected type for a class-based node implementation.
 */
export type NodeClass = new (params?: any) => BaseNode<any, any>

/** A union of all possible node implementation types. */
export type NodeImplementation = NodeFunction | NodeClass

// =================================================================================
// Context Interfaces (State Management)
// =================================================================================

/** A discriminated union for all possible context implementations. */
export type ContextImplementation<T extends Record<string, any>> = ISyncContext<T> | IAsyncContext<T>

/** The synchronous context interface for high-performance, in-memory state. */
export interface ISyncContext<TContext extends Record<string, any> = Record<string, any>> {
	readonly type: 'sync'
	get: <K extends keyof TContext>(key: K) => TContext[K] | undefined
	set: <K extends keyof TContext>(key: K, value: TContext[K]) => void
	has: (key: keyof TContext) => boolean
	delete: (key: keyof TContext) => boolean
	toJSON: () => Record<string, any>
}

/** The asynchronous context interface for remote or distributed state. */
export interface IAsyncContext<TContext extends Record<string, any> = Record<string, any>> {
	readonly type: 'async'
	get: <K extends keyof TContext>(key: K) => Promise<TContext[K] | undefined>
	set: <K extends keyof TContext>(key: K, value: TContext[K]) => Promise<void>
	has: (key: keyof TContext) => Promise<boolean>
	delete: (key: keyof TContext) => Promise<boolean>
	toJSON: () => Promise<Record<string, any>>
}

// =================================================================================
// Runtime & Extensibility Interfaces
// =================================================================================

/** Generic for any set of dependencies. */
export interface RuntimeDependencies { [key: string]: any }

/** Configuration options for the FlowcraftRuntime. */
export interface RuntimeOptions<TDependencies extends RuntimeDependencies = RuntimeDependencies> {
	/** A registry of globally available node implementations. */
	registry?: Record<string, NodeFunction | NodeClass>
	/** Shared dependencies to be injected into every node. */
	dependencies?: TDependencies
	/** A pluggable event bus for observability. */
	eventBus?: IEventBus
	/** A pluggable evaluator for edge conditions and transforms. */
	evaluator?: IEvaluator
	/** An array of middleware to wrap node execution. */
	middleware?: Middleware[]
	/** A pluggable serializer for handling complex data types in the context. */
	serializer?: ISerializer
}

/** Interface for a pluggable expression evaluator for conditions and transforms. */
export interface IEvaluator {
	/**
	 * Evaluates a string expression against a data context.
	 * @param expression The string expression to evaluate.
	 * @param context A key-value object of data to be used in the expression.
	 * @returns The result of the evaluation.
	 */
	evaluate: (expression: string, context: Record<string, any>) => any
}

/** Interface for a pluggable event bus. */
export interface IEventBus {
	emit: (eventName: string, payload: Record<string, any>) => void | Promise<void>
}

/** Interface for a pluggable serializer. */
export interface ISerializer {
	serialize: (data: Record<string, any>) => string
	deserialize: (text: string) => Record<string, any>
}

/** Interface for middleware to handle cross-cutting concerns. */
export interface Middleware<TContext extends Record<string, any> = Record<string, any>> {
	beforeNode?: (
		ctx: ContextImplementation<TContext>,
		nodeId: string,
	) => void | Promise<void>
	afterNode?: (
		ctx: ContextImplementation<TContext>,
		nodeId: string,
		result: NodeResult | undefined,
		error: Error | undefined,
	) => void | Promise<void>
	aroundNode?: (
		ctx: ContextImplementation<TContext>,
		nodeId: string,
		next: () => Promise<NodeResult>
	) => Promise<NodeResult>
}

/** A structured error object returned from a failed workflow execution. */
export interface WorkflowError {
	nodeId: string
	message: string
	originalError?: any
}

/** The final result of a workflow execution. */
export interface WorkflowResult<TContext = any> {
	/** The final state of the workflow's context. */
	context: TContext
	/** The final context state, serialized as a string. */
	serializedContext: string
	/** The final status of the workflow. */
	status: 'completed' | 'failed' | 'stalled'
	/** An array of errors that occurred during execution. Present if status is 'failed'. */
	errors?: WorkflowError[]
}

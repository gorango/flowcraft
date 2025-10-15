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
export interface NodeResult<TOutput = any, TAction extends string = string> {
	output?: TOutput
	action?: TAction
	error?: { message: string; [key: string]: any }
	/** Allows a node to dynamically schedule new nodes for the orchestrator to execute. */
	dynamicNodes?: NodeDefinition[]
	/** Internal flag: Indicates that this result came from a fallback execution. */
	_fallbackExecuted?: boolean
}

/** The context object passed to every node's execution logic. */
export interface NodeContext<
	TContext extends Record<string, any> = Record<string, any>,
	TDependencies extends RuntimeDependencies = RuntimeDependencies,
	TInput = any,
> {
	/** The async-only interface for interacting with the workflow's state. */
	context: IAsyncContext<TContext>
	/** The primary input data for this node, typically from its predecessor. */
	input?: TInput
	/** Static parameters defined in the blueprint. */
	params: Record<string, any>
	/** Shared, runtime-level dependencies (e.g., database clients, loggers). */
	dependencies: TDependencies
	/** A signal to gracefully cancel long-running node operations. */
	signal?: AbortSignal
}

/** A simple function-based node implementation. */
export type NodeFunction<
	TContext extends Record<string, any> = Record<string, any>,
	TDependencies extends RuntimeDependencies = RuntimeDependencies,
	TInput = any,
	TOutput = any,
	TAction extends string = string,
> = (context: NodeContext<TContext, TDependencies, TInput>) => Promise<NodeResult<TOutput, TAction>>

/** Represents a constructor for any concrete class that extends the abstract BaseNode. */
export type NodeClass<
	TContext extends Record<string, any> = Record<string, any>,
	TDependencies extends RuntimeDependencies = RuntimeDependencies,
	TInput = any,
	TOutput = any,
	TAction extends string = string,
> = new (params?: Record<string, any>) => BaseNode<TContext, TDependencies, TInput, TOutput, TAction>

/** A union of all possible node implementation types. */
export type NodeImplementation = NodeFunction | NodeClass

/** A registry mapping node types to their implementations. */
export type NodeRegistry = Record<string, NodeImplementation>

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
	has: <K extends keyof TContext>(key: K) => boolean
	delete: <K extends keyof TContext>(key: K) => boolean
	toJSON: () => Record<string, any>
}

/** The asynchronous context interface for remote or distributed state. */
export interface IAsyncContext<TContext extends Record<string, any> = Record<string, any>> {
	readonly type: 'async'
	get: <K extends keyof TContext>(key: K) => Promise<TContext[K] | undefined>
	set: <K extends keyof TContext>(key: K, value: TContext[K]) => Promise<void>
	has: <K extends keyof TContext>(key: K) => Promise<boolean>
	delete: <K extends keyof TContext>(key: K) => Promise<boolean>
	toJSON: () => Promise<Record<string, any>>
}

// =================================================================================
// Runtime & Extensibility Interfaces
// =================================================================================

/** Generic for any set of dependencies. */
export interface RuntimeDependencies {
	[key: string]: any
}

/** Configuration options for the FlowRuntime. */
export interface RuntimeOptions<TDependencies extends RuntimeDependencies = RuntimeDependencies> {
	/** A registry of globally available node implementations. */
	registry?: Record<string, NodeFunction | NodeClass | typeof BaseNode>
	/** A registry of all available workflow blueprints for subflow execution. */
	blueprints?: Record<string, WorkflowBlueprint>
	/** Shared dependencies to be injected into every node. */
	dependencies?: TDependencies
	/** A pluggable logger for consistent output. */
	logger?: ILogger
	/** A pluggable event bus for observability. */
	eventBus?: IEventBus
	/**
	 * A pluggable evaluator for edge conditions and transforms.
	 * @default new PropertyEvaluator() - A safe evaluator for simple property access.
	 * For complex logic, provide a custom implementation or use the `UnsafeEvaluator`
	 * (not recommended for production).
	 */
	evaluator?: IEvaluator
	/** An array of middleware to wrap node execution. */
	middleware?: Middleware[]
	/** A pluggable serializer for handling complex data types in the context. */
	serializer?: ISerializer
	/** A flag to enforce strictness in the workflow. */
	strict?: boolean
}

/** Interface for a pluggable expression evaluator for conditions and transforms. */
export interface IEvaluator {
	evaluate: (expression: string, context: Record<string, any>) => any
}

/** Interface for a pluggable logger. */
export interface ILogger {
	debug: (message: string, meta?: Record<string, any>) => void
	info: (message: string, meta?: Record<string, any>) => void
	warn: (message: string, meta?: Record<string, any>) => void
	error: (message: string, meta?: Record<string, any>) => void
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
	beforeNode?: (ctx: ContextImplementation<TContext>, nodeId: string) => void | Promise<void>
	afterNode?: (
		ctx: ContextImplementation<TContext>,
		nodeId: string,
		result: NodeResult | undefined,
		error: Error | undefined,
	) => void | Promise<void>
	aroundNode?: (
		ctx: ContextImplementation<TContext>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	) => Promise<NodeResult>
}

/** A structured error object returned from a failed workflow execution. */
export interface WorkflowError {
	nodeId: string
	message: string
	originalError?: any
}

/** The final result of a workflow execution. */
export interface WorkflowResult<TContext = Record<string, any>> {
	context: TContext
	serializedContext: string
	status: 'completed' | 'failed' | 'stalled' | 'cancelled'
	errors?: WorkflowError[]
}

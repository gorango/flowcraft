import type { FlowcraftError } from './errors'
import type { BaseNode } from './node'
import type { ExecutionContext } from './runtime/execution-context'
import type { WorkflowState } from './runtime/state'

// =================================================================================
// Common Types
// =================================================================================

/** Source location information for debugging and visualization. */
export interface SourceLocation {
	file: string
	line: number
	column: number
}

// =================================================================================
// Blueprint Interfaces (The Declarative Definition)
// =================================================================================

/** Metadata associated with a workflow blueprint. */
export interface WorkflowBlueprintMetadata {
	/** Optional version identifier for the blueprint. Used in distributed systems to ensure version compatibility. */
	version?: string
	/** Entry points for cycles in the workflow graph. */
	cycleEntryPoints?: string[]
	[key: string]: any
}

/** The central, serializable representation of a workflow. */
export interface WorkflowBlueprint {
	id: string
	nodes: NodeDefinition[]
	edges: EdgeDefinition[]
	metadata?: WorkflowBlueprintMetadata
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
	/** Source location for debugging and visualization. */
	_sourceLocation?: SourceLocation
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
	/** Source location for debugging and visualization. */
	_sourceLocation?: SourceLocation
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
	dependencies: TDependencies & {
		runtime: ExecutionContext<TContext, TDependencies>
		workflowState: WorkflowState<TContext>
	}
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
> = new (params?: Record<string, any>, nodeId?: string) => BaseNode<TContext, TDependencies, TInput, TOutput, TAction>

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
	get<K extends keyof TContext>(key: K): TContext[K] | undefined
	get(key: string): any | undefined
	set<K extends keyof TContext>(key: K, value: TContext[K]): void
	set(key: string, value: any): void
	has<K extends keyof TContext>(key: K): boolean
	has(key: string): boolean
	delete<K extends keyof TContext>(key: K): boolean
	delete(key: string): boolean
	toJSON: () => Record<string, any>
}

/** The asynchronous context interface for remote or distributed state. */
export interface IAsyncContext<TContext extends Record<string, any> = Record<string, any>> {
	readonly type: 'async'
	get<K extends keyof TContext>(key: K): Promise<TContext[K] | undefined>
	get(key: string): Promise<any | undefined>
	set<K extends keyof TContext>(key: K, value: TContext[K]): Promise<void>
	set(key: string, value: any): Promise<void>
	has<K extends keyof TContext>(key: K): Promise<boolean>
	has(key: string): Promise<boolean>
	delete<K extends keyof TContext>(key: K): Promise<boolean>
	delete(key: string): Promise<boolean>
	toJSON: () => Promise<Record<string, any>>

	/**
	 * Applies a batch of patch operations atomically.
	 * More efficient than individual set/delete calls for bulk updates.
	 */
	patch(operations: PatchOperation[]): Promise<void>
}

/** Represents a single patch operation for delta-based state updates. */
export type PatchOperation = { op: 'set'; key: string; value: any } | { op: 'delete'; key: string }

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

/** Structured event types for detailed execution tracing. */
export type FlowcraftEvent =
	| { type: 'workflow:start'; payload: { blueprintId: string; executionId: string } }
	| { type: 'workflow:resume'; payload: { blueprintId: string; executionId: string } }
	| { type: 'workflow:stall'; payload: { blueprintId: string; executionId: string; remainingNodes: number } }
	| { type: 'workflow:pause'; payload: { blueprintId: string; executionId: string } }
	| {
			type: 'workflow:finish'
			payload: { blueprintId: string; executionId: string; status: string; errors?: WorkflowError[] }
	  }
	| { type: 'node:start'; payload: { nodeId: string; executionId: string; input: any; blueprintId: string } }
	| { type: 'node:finish'; payload: { nodeId: string; result: NodeResult; executionId: string; blueprintId: string } }
	| { type: 'node:error'; payload: { nodeId: string; error: FlowcraftError; executionId: string; blueprintId: string } }
	| { type: 'node:fallback'; payload: { nodeId: string; executionId: string; fallback: string; blueprintId: string } }
	| { type: 'node:retry'; payload: { nodeId: string; attempt: number; executionId: string; blueprintId: string } }
	| {
			type: 'node:skipped'
			payload: { nodeId: string; edge: EdgeDefinition; executionId: string; blueprintId: string }
	  }
	| { type: 'edge:evaluate'; payload: { source: string; target: string; condition?: string; result: boolean } }
	| {
			type: 'context:change'
			payload: { sourceNode: string; key: string; op: 'set' | 'delete'; value?: any; executionId: string }
	  }
	| { type: 'job:enqueued'; payload: { runId: string; blueprintId: string; nodeId: string; queueName?: string } }
	| {
			type: 'job:processed'
			payload: { runId: string; blueprintId: string; nodeId: string; duration: number; success: boolean }
	  }
	| { type: 'job:failed'; payload: { runId: string; blueprintId: string; nodeId: string; error: FlowcraftError } }
	| {
			type: 'batch:start'
			payload: { batchId: string; scatterNodeId: string; workerNodeIds: string[] }
	  }
	| {
			type: 'batch:finish'
			payload: { batchId: string; gatherNodeId: string; results: any[] }
	  }

/** Interface for a pluggable event bus. */
export interface IEventBus {
	emit: (event: FlowcraftEvent) => void | Promise<void>
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
export interface WorkflowError extends FlowcraftError {
	timestamp: string // ISO 8601 format
	originalError?: any // Legacy compatibility
}

/** The status of a workflow execution. */
export type WorkflowStatus = 'completed' | 'failed' | 'stalled' | 'cancelled' | 'awaiting'

/** The final result of a workflow execution. */
export interface WorkflowResult<TContext = Record<string, any>> {
	context: TContext
	serializedContext: string
	status: WorkflowStatus
	errors?: WorkflowError[]
}

// =================================================================================
// UI Graph Interface (For Visualization)
// =================================================================================

/** A graph representation of a workflow blueprint. */
export interface UIGraph {
	nodes: Array<Partial<NodeDefinition> & { id: string; data?: Record<string, any>; type?: string }>
	edges: Array<Partial<EdgeDefinition> & { source: string; target: string; data?: Record<string, any> }>
}

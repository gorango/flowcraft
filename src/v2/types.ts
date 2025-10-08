/**
 * Core types for Flowcraft V2 architecture
 * These types represent the unified, serializable blueprint that all workflows compile to
 */

/**
 * The central, serializable representation of any flow
 * This is the single source of truth that can be persisted, distributed, or executed
 */
export interface WorkflowBlueprint {
	/** Unique identifier for this blueprint */
	id: string
	/** Metadata about the blueprint */
	metadata?: {
		name?: string
		description?: string
		version?: string
		tags?: string[]
	}
	/** Node definitions that make up this workflow */
	nodes: NodeDefinition[]
	/** Edge definitions that connect the nodes */
	edges: EdgeDefinition[]
	/** Input schema for the workflow */
	inputs?: Record<string, any>
	/** Output schema for the workflow */
	outputs?: Record<string, any>
}

/**
 * Definition of a single node in the workflow
 */
export interface NodeDefinition {
	/** Unique identifier for this node within the blueprint */
	id: string
	/** The type of node - either a registered node class or a function key */
	uses: string
	/** Static configuration/parameters for the node */
	params?: Record<string, any>
	/** Runtime configuration (retries, timeouts, etc.) */
	config?: NodeConfig
	/** Input mapping for this node */
	inputs?: Record<string, string>
	/** Output mapping for this node */
	outputs?: Record<string, string>
}

/**
 * Configuration options for a node's resiliency and behavior.
 */
export interface NodeConfig {
	/** Maximum number of retry attempts (e.g., 3 means 1 initial try + 2 retries). Defaults to 1. */
	maxRetries?: number
	/** Delay between retries in milliseconds. Defaults to 0. */
	retryDelay?: number
	/** Maximum execution time in milliseconds before the node fails. */
	timeout?: number
	/** The `uses` key of another node implementation to call if all retries fail. */
	fallback?: string
}

/**
 * Definition of an edge connecting two nodes
 */
export interface EdgeDefinition {
	/** Source node ID */
	source: string
	/** Target node ID */
	target: string
	/** Optional action that triggers this edge */
	action?: string
	/** Optional condition for this edge */
	condition?: string
	/** Optional data transformation */
	transform?: string
}

/**
 * Context interface that nodes receive
 * This is generic over the specific context type for type safety
 */
export interface NodeContext<TContext = any> {
	/** Get a value from the context */
	get: <K extends keyof TContext>(key: K) => TContext[K] | undefined
	/** Set a value in the context */
	set: <K extends keyof TContext>(key: K, value: TContext[K]) => void
	/** Check if a key exists in the context */
	has: (key: keyof TContext) => boolean
	/** Get all context keys */
	keys: () => (keyof TContext)[]
	/** Get all context values */
	values: () => TContext[]
	/** Get all context entries */
	entries: () => [keyof TContext, TContext][]
	/** The input data from the previous node */
	input?: any
	/** Metadata about the current execution */
	metadata: ExecutionMetadata
	/** Shared runtime dependencies */
	dependencies: RuntimeDependencies
}

/**
 * Metadata about the current workflow execution
 */
export interface ExecutionMetadata {
	/** Unique ID for this execution */
	executionId: string
	/** ID of the blueprint being executed */
	blueprintId: string
	/** Current node being executed */
	currentNodeId: string
	/** Timestamp when execution started */
	startedAt: Date
	/** Current execution environment */
	environment: 'development' | 'staging' | 'production'
}

/**
 * The return type of a node function
 */
export interface NodeResult<TOutput = any> {
	/** The primary output data */
	output?: TOutput
	/** Action to take (for branching) */
	action?: string
	/** Error information if the node failed */
	error?: {
		message: string
		code?: string
		details?: any
	}
	/** Additional metadata */
	metadata?: Record<string, any>
}

/**
 * Registry entry for nodes
 */
export interface NodeRegistryEntry {
	/** The node implementation */
	implementation: NodeImplementation
	/** Schema for the node's parameters */
	schema?: any
	/** Description of what the node does */
	description?: string
	/** Tags for categorization */
	tags?: string[]
}

/**
 * Node implementation - can be a class or function
 */
export type NodeImplementation = NodeClass | NodeFunction

/**
 * Class-based node implementation (for complex, reusable nodes)
 */
export interface NodeClass {
	new(params?: any): {
		execute: (context: NodeContext) => Promise<NodeResult>
	}
}

/**
 * Function-based node implementation (for simple, inline nodes)
 */
export type NodeFunction = (context: NodeContext) => Promise<NodeResult>

/**
 * Registry for nodes and their implementations
 */
export interface NodeRegistry {
	[key: string]: NodeRegistryEntry
}

/**
 * Interface for a pluggable serializer.
 */
export interface ISerializer {
	serialize: (data: Record<string, any>) => string
	deserialize: (text: string) => Record<string, any>
}

/**
 * Interface for a pluggable event bus.
 */
export interface IEventBus {
	emit: (eventName: string, payload: Record<string, any>) => Promise<void> | void
}

/**
 * Runtime dependencies that can be injected
 */
export interface RuntimeDependencies {
	[key: string]: any
}

/**
 * Options for the runtime
 */
export interface RuntimeOptions {
	/** Global node registry */
	registry: NodeRegistry
	/** Shared dependencies for dependency injection */
	dependencies?: RuntimeDependencies
	/** Default node configuration */
	defaultNodeConfig?: NodeConfig
	/** Execution environment */
	environment?: 'development' | 'staging' | 'production'
	/** Pluggable serializer for context persistence */
	serializer?: ISerializer
	/** Pluggable event bus for observability */
	eventBus?: IEventBus
}

/**
 * Result of running a workflow
 */
export interface WorkflowResult<TContext = any> {
	/** Final context state */
	context: TContext
	/** Execution metadata */
	metadata: {
		executionId: string
		blueprintId: string
		startedAt: Date
		completedAt: Date
		duration: number
		status: 'completed' | 'failed' | 'cancelled'
		error?: {
			nodeId: string
			message: string
			details?: any
		}
	}
}

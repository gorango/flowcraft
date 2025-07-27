import type { AbstractNode, Flow, NodeOptions } from '../workflow'

/**
 * Defines the schema for all custom node types within a specific workflow application.
 *
 * It is a map where each key is a string identifier for a node `type`
 * (e.g., `'llm-process'`), and the value is an object defining the expected
 * shape of that node's `data` payload.
 *
 * By creating an application-specific interface that extends `NodeTypeMap`,
 * you enable compile-time validation and autocompletion for your declarative
 * graph definitions. This type is the central generic constraint used by
 * `TypedWorkflowGraph`, `TypedNodeRegistry`, and `GraphBuilder` to provide a
 * fully type-safe development experience.
 *
 * @example
 * // 1. Define the data payloads for your application's nodes.
 * interface MyAppNodeTypeMap extends NodeTypeMap {
 *   'api-call': { url: string; retries: number };
 *   'data-transform': { mode: 'uppercase' | 'lowercase' };
 *   'output': { destination: string };
 * }
 *
 * // 2. Use it to create a type-safe graph definition.
 * const myGraph: TypedWorkflowGraph<MyAppNodeTypeMap> = {
 *   nodes: [
 *     // TypeScript will validate that `data` matches the 'api-call' schema.
 *     { id: 'fetch', type: 'api-call', data: { url: '/users', retries: 3 } },
 *     // TypeScript would throw an error on the following line:
 *     { id: 'bad', type: 'api-call', data: { path: '/users' } } // Missing 'url' and 'retries'
 *   ],
 *   edges: [],
 * };
 */
export interface NodeTypeMap { [key: string]: Record<string, any> }

/**
 * The standard options object passed to a Node's constructor by the `GraphBuilder`.
 * @template TData The type of the `data` payload for this specific node.
 * @template TContext The type of the dependency injection context.
 */
export interface NodeConstructorOptions<TData, _TContext = object> extends NodeOptions {
	/** The `data` payload from the graph definition, with `nodeId` injected for logging/debugging. */
	data: TData & { nodeId: string }
	/** A context object containing any dependencies injected into the `GraphBuilder` constructor. */
	[key: string]: any
}

/**
 * Represents a single, type-safe node within a declarative workflow graph.
 * This is a discriminated union based on the `type` property, ensuring that
 * the `data` payload matches the node's type as defined in the `TypedNodeRegistry`.
 * @template T The `NodeTypeMap` that defines all possible node types and their data schemas.
 */
export type TypedGraphNode<T extends { [K in keyof T]: Record<string, any> }> = {
	[K in keyof T]: {
		/** A unique identifier for the node within the graph. */
		id: string
		/** The type of the node, used to look up the corresponding Node class in the registry. */
		type: K
		/** A flexible data object that must match the schema defined in the `NodeTypeMap` for this type. */
		data: T[K]
	}
}[keyof T]

/**
 * Represents a directed edge connecting two nodes in a workflow graph.
 */
export interface GraphEdge {
	/** The `id` of the source node. */
	source: string
	/** The `id` of the target node. */
	target: string
	/** The action from the source node that triggers this edge. Defaults to `DEFAULT_ACTION`. */
	action?: string
}

/**
 * Defines the structure of a type-safe, declarative workflow graph.
 * @template T The `NodeTypeMap` that validates the graph's node definitions.
 */
export interface TypedWorkflowGraph<T extends { [K in keyof T]: Record<string, any> }> {
	/** An array of node definitions. */
	nodes: TypedGraphNode<T>[]
	/** An array of edge definitions that connect the nodes. */
	edges: GraphEdge[]
}

/**
 * A type-safe registry that maps a node type string to its corresponding `Node` constructor.
 * @template TNodeMap The `NodeTypeMap` that defines all possible node types and their data schemas.
 * @template TContext The type of the dependency injection context passed to each constructor.
 */
export type TypedNodeRegistry<TNodeMap extends NodeTypeMap, TContext = object> = {
	[K in keyof TNodeMap as string extends K ? never : number extends K ? never : K]:
	new (options: NodeConstructorOptions<TNodeMap[K], TContext> & TContext) => AbstractNode
}

/**
 * The result of a successful `GraphBuilder.build()` call.
 */
export interface BuildResult {
	/** The fully wired, executable `Flow` instance. */
	flow: Flow
	/** A map of all created node instances, keyed by their `id` from the graph definition. */
	nodeMap: Map<string, AbstractNode>
	/** A map of all node `id`s to their predecessor count. */
	predecessorCountMap: Map<string, number>
}

/**
 * Represents a node within the workflow graph.
 * This is a simpler (UNTYPED) version of the `TypedGraphNode` type
 */
export interface GraphNode {
	id: string
	type: string
	data?: Record<string, any>
}

/**
 * Defines the structure of a workflow graph.
 * This is a simpler (UNTYPED) version of the `TypedWorkflowGraph` type
 */
export interface WorkflowGraph {
	nodes: GraphNode[]
	edges: GraphEdge[]
}

/**
 * A permissive (UNTYPED) registry that maps a node type string to a constructor.
 * This is a simpler (UNTYPED) version of the `TypedNodeRegistry` type
 */
export type NodeRegistry = Map<string, new (...args: any[]) => AbstractNode>

export interface GraphBuilderOptions {
	subWorkflowNodeTypes?: string[]
}

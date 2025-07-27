# API Reference: Builders

Builders are helper classes provided by Flowcraft to abstract away the manual construction of common and complex workflow patterns. They allow you to define high-level behavior, and the builder handles the underlying `Node` and `Flow` wiring for you.

You can import all builders from the main `flowcraft` package.

```typescript
import {
	BatchFlow,
	GraphBuilder,
	ParallelBatchFlow,
	ParallelFlow,
	SequenceFlow,
} from 'flowcraft'
```

## `SequenceFlow`

A `Flow` that creates a linear workflow from a sequence of nodes, automatically chaining them in order.

`extends Flow`

### Constructor

`new SequenceFlow(...nodes: AbstractNode[])`

- `...nodes`: A sequence of `Node` or `Flow` instances to be executed in order.

### Example

```typescript
const linearFlow = new SequenceFlow(
	new GetUserNode(),
	new ProcessDataNode(),
	new SaveResultNode()
)
```

---

## `ParallelFlow`

A `Flow` that executes a collection of nodes concurrently. This is the core of the "fan-out, fan-in" pattern. After all parallel branches complete, the flow proceeds to its single successor.

`extends Flow`

### Constructor

`new ParallelFlow(nodes: AbstractNode[])`

- `nodes`: An array of `Node` or `Flow` instances to be executed in parallel.

### Example

```typescript
const parallelStep = new ParallelFlow([
	new FetchApiANode(),
	new FetchApiBNode(),
])
const aggregateNode = new AggregateResultsNode()

// After both API calls are complete, the aggregateNode will run.
parallelStep.next(aggregateNode)
```

---

## `BatchFlow`

An **abstract** `Flow` that processes a collection of items sequentially, one by one.

`extends Flow`

### Abstract Members to Implement

When you extend `BatchFlow`, you must implement the following:

- `protected abstract nodeToRun: AbstractNode`: You must implement this property to provide the `Node` instance that will be executed for each item in the batch.
- `async prep(args: NodeArgs): Promise<Iterable<any>>`: This method provides the list of parameter objects. The `nodeToRun` will be executed once for each of these objects, with the object's contents merged into the `params`.

---

## `ParallelBatchFlow`

An **abstract** `Flow` that processes a collection of items concurrently. This provides a significant performance boost for I/O-bound tasks.

`extends Flow`

### Abstract Members to Implement

When you extend `ParallelBatchFlow`, you must implement the following:

- `protected abstract nodeToRun: AbstractNode`: You must implement this property to provide the `Node` instance that will be executed concurrently for each item in the batch.
- `async prep(args: NodeArgs): Promise<Iterable<any>>`: This method provides the list of parameter objects to be processed in parallel.

---

## `GraphBuilder`

A powerful builder that constructs an executable `Flow` from a declarative `WorkflowGraph` definition (e.g., from a JSON file). It supports a fully type-safe API for compile-time validation of graph definitions and dependency injection.

> [!IMPORTANT]
> To leverage compile-time type safety, you must use the `createNodeRegistry` helper. By defining a `NodeTypeMap` (for your node `data` payloads) and a `TContext` type (for your shared dependencies), TypeScript can validate your entire graph and dependency usage at compile time, eliminating a whole category of runtime configuration errors.
>
> (See how the **[Rag Agent](https://github.com/gorango/flowcraft/tree/master/sandbox/6.rag/)** implements a simple node registry; the **[Dynamic AI Agent](https://github.com/gorango/flowcraft/tree/master/sandbox/5.distributed/)** even demonstrates type-safety despite using *dynamic graphs*.)

### Sub-Workflow Composition (Graph Inlining)

The `GraphBuilder` has built-in support for composing workflows. You must declare which node types should be treated as sub-workflows by passing them in the `options` parameter of the constructor. When the builder encounters a node of a registered sub-workflow type, it automatically performs **graph inlining**:

1.  It fetches the sub-workflow's graph definition from a `WorkflowRegistry` (which must be provided in the `nodeOptionsContext`).
2.  It injects the sub-workflow's nodes and edges into the parent graph.
3.  It automatically creates and wires lightweight mapping nodes to handle the data contract defined in the `inputs` and `outputs` properties of the node's `data` payload.

This powerful, build-time process creates a single, flattened graph, which simplifies the execution logic for both in-memory and distributed runtimes.

### Constructor

`new GraphBuilder<TNodeMap, TContext>(registry, nodeOptionsContext?, options?, logger?)`

-   `registry: TypedNodeRegistry<TNodeMap, TContext> | NodeRegistry`: An object or `Map` where keys are `type` strings from the graph definition and values are the corresponding `Node` class constructors. For type-safety, use the `createNodeRegistry` helper.
-   `nodeOptionsContext?: TContext`: An optional object passed to every node's constructor, merged with the node's `data`. This is the primary mechanism for **type-safe dependency injection**, allowing you to pass shared services like database clients or API handlers to all nodes.
-   `options?: { subWorkflowNodeTypes?: string[] }`: An optional configuration object.
    -   `subWorkflowNodeTypes`: An array of node `type` strings that should be treated as composable sub-workflows. The builder will inline any node whose type is in this list.
-   `logger?: Logger`: An optional `Logger` instance. If provided, the `GraphBuilder` will automatically generate and log a Mermaid.js diagram of the final, flattened graph every time `.build()` is called. This is an invaluable tool for debugging.

### Type-Safe Dependency Injection Example

```typescript
import { createNodeRegistry, GraphBuilder, Node, NodeConstructorOptions } from 'flowcraft'

// 1. Define the shape of your dependencies
interface MyAppContext { api: { fetch: (url: string) => Promise<any> } }

// 2. Define your node type map
interface MyNodeTypeMap {
	'fetch-user': { userId: number }
}

// 3. Create a node that uses the injected context
class FetchUserNode extends Node {
	private userId: number
	private api: MyAppContext['api']

	constructor(options: NodeConstructorOptions<MyNodeTypeMap['fetch-user'], MyAppContext> & MyAppContext) {
		super(options)
		this.userId = options.data.userId
		// The `api` dependency is available and fully typed!
		this.api = options.api
	}

	async exec() {
		return this.api.fetch(`/users/${this.userId}`)
	}
}

// 4. Create a type-safe registry with the context
const registry = createNodeRegistry<MyNodeTypeMap, MyAppContext>({
	'fetch-user': FetchUserNode,
})

// 5. Instantiate the builder with the dependencies
const builder = new GraphBuilder(registry, {
	api: { fetch: async url => ({ name: 'Alice' }) },
})
```

### Methods

-   `.build(graph: WorkflowGraph): BuildResult`: The main method that takes a graph definition and returns a `BuildResult` object.

#### The `BuildResult` Object

The `.build()` method returns an object containing:

-   `flow: Flow`: The fully wired, executable `Flow` instance.
-   `nodeMap: Map<string, AbstractNode>`: A map of all created node instances, keyed by their `id` from the graph definition.
-   `predecessorCountMap: Map<string, number>`: A map of each node's `id` to the number of its direct predecessors. This is essential for implementing a reliable "fan-in" or "join" pattern in custom distributed executors.

> [!TIP]
> The `nodeMap` is the most efficient way to get a reference to a specific node instance within a built flow. It provides an instant, O(1) lookup, which is ideal for debugging, monitoring, or dynamic inspection.
>
> ```typescript
> const { flow, nodeMap } = builder.build(myGraph)
> const specificNode = nodeMap.get('my-node-id')
> ```

### `WorkflowGraph` Interface

The data structure that `GraphBuilder` consumes.

-   `nodes: GraphNode[] | TypedGraphNode[]`: An array of node definitions.
    -   `id: string`: A unique identifier for the node.
    -   `type: string`: The key to look up the node's class in the `NodeRegistry`.
    -   `data?: Record<string, any>`: A flexible data object passed as options to the node's constructor. For sub-workflow nodes, this must contain a `workflowId`.
-   `edges: GraphEdge[]`: An array of edge definitions.
    -   `source: string`: The `id` of the source node.
    -   `target: string`: The `id` of the target node.
    -   `action?: string`: The action from the source node that triggers this edge. Defaults to `DEFAULT_ACTION`.

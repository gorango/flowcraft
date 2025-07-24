# API Reference: Builders

Builders are helper classes provided by Cascade to abstract away the manual construction of common and complex workflow patterns. They allow you to define high-level behavior, and the builder handles the underlying `Node` and `Flow` wiring for you.

You can import all builders from the main `cascade` package.

```typescript
import {
  SequenceFlow,
  ParallelFlow,
  BatchFlow,
  ParallelBatchFlow,
  GraphBuilder,
} from 'cascade'
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

A powerful builder that constructs an executable `Flow` from a declarative `WorkflowGraph` definition (e.g., from a JSON file). It supports a fully type-safe API for compile-time validation of graph definitions.

> [!IMPORTANT]
> To leverage compile-time type safety, you must use the `createNodeRegistry` helper and define a `NodeTypeMap` that maps your node type strings to their expected `data` payloads. This prevents configuration errors before you even run your code.
>
> (See how the **[Rag Agent](https://github.com/gorango/cascade/tree/master/sandbox/6.rag/)** implements a simple node registry; the **[Dynamic AI Agent](https://github.com/gorango/cascade/tree/master/sandbox/4.dag/)** even demonstrates type-safety despite using *dynamic graphs*.)

### Constructor

`new GraphBuilder(nodeRegistry, nodeOptionsContext?)`

- `nodeRegistry: TypedNodeRegistry | NodeRegistry`: An object or `Map` where keys are `type` strings from the graph definition and values are the corresponding `Node` class constructors. For type-safety, use the `createNodeRegistry` helper.
- `nodeOptionsContext?: Record<string, any>`: An optional object that is passed to every node's constructor, useful for dependency injection (e.g., passing the `GraphBuilder` instance itself to a `SubWorkflowNode`).

### Methods

- `.build(graph: WorkflowGraph): BuildResult`: The main method that takes a graph definition and returns a `BuildResult` object containing the fully wired, executable `flow` and a `nodeMap` of all created node instances keyed by their ID.

### `WorkflowGraph` Interface

The data structure that `GraphBuilder` consumes.

- `nodes: GraphNode[] | TypedGraphNode[]`: An array of node definitions.
  - `id: string`: A unique identifier for the node.
  - `type: string`: The key to look up the node's class in the `NodeRegistry`.
  - `data?: Record<string, any>`: A flexible data object passed as options to the node's constructor. When using the type-safe API, this object's schema is validated at compile time.
- `edges: GraphEdge[]`: An array of edge definitions.
  - `source: string`: The `id` of the source node.
  - `target: string`: The `id` of the target node.
  - `action?: string`: The action from the source node that triggers this edge. Defaults to `DEFAULT_ACTION`.

# API Reference: Builders

This document covers the builder classes provided by Cascade. Builders are helpers that abstract the construction of common and complex workflow patterns. All builders are imported from the main `cascade` package.

```typescript
import {
  SequenceFlow,
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

## `BatchFlow`

A `Flow` that processes a collection of items sequentially, one by one. You must extend this class and implement the `prep` method.

`extends Flow`

### Methods to Implement

- `async prep(args: NodeArgs): Promise<Iterable<any>>`: This method must be implemented in your subclass. It should return an array or other iterable of parameter objects. The workflow defined in the `Flow` will be executed once for each of these objects, with the object's contents merged into the `params`.

---

## `ParallelBatchFlow`

A `Flow` that processes a collection of items concurrently. This provides a significant performance boost for I/O-bound tasks. Like `BatchFlow`, you must extend this class and implement the `prep` method.

`extends Flow`

### Methods to Implement

- `async prep(args: NodeArgs): Promise<Iterable<any>>`: Same as `BatchFlow`. It provides the list of parameter objects to be processed in parallel.

---

## `GraphBuilder`

A powerful builder that constructs an executable `Flow` from a declarative `WorkflowGraph` definition (e.g., from a JSON file). It supports a fully type-safe API for compile-time validation of graph definitions.

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

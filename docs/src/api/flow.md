# Flow

The [`Flow`](/api/flow#flow-class) class and `createFlow` function provide a fluent, type-safe API for programmatically building a [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface).

## `createFlow(id)`

Creates and returns a new [`Flow`](/api/flow#flow-class) builder instance.

-   **`id`** `string`: A unique identifier for the workflow.
-   **Returns**: `Flow<TContext, TDependencies>`

## `Flow` Class

### `.node<TInput, TOutput, TAction>(id, implementation, options?)`

Adds a node to the workflow definition with full type safety.

-   **`id`** `string`: A unique identifier for the node.
-   **`implementation`** `NodeFunction<TContext, TDependencies, TInput, TOutput, TAction> | NodeClass<TContext, TDependencies, TInput, TOutput, TAction>`: The logic for the node.
-   **`options?`** `Omit<NodeDefinition, 'id' | 'uses'>`: Optional configuration for the node, including `inputs`, `params`, and `config`.
-   **Returns**: `this` (for chaining).

**Type-safe Example:**
```typescript
flow.node<{id: string}, {status: 'ok'}, 'done'>('process', async ({ input }) => {
  return { output: { status: 'ok' }, action: 'done' };
});
```

### `.edge(source, target, options?)`

Adds an edge to define a dependency between two nodes.

-   **`source`** `string`: The `id` of the source node.
-   **`target`** `string`: The `id` of the target node.
-   **`options?`** `Omit<EdgeDefinition, 'source' | 'target'>`: Optional configuration for the edge, including `action`, `condition`, and `transform`.
-   **Returns**: `this` (for chaining).

### `.batch<TInput, TOutput, TAction>(id, worker, options)`

Creates a scatter-gather batch processing pattern with full type safety.

-   **`id`** `string`: A base ID for the batch operation. This will be used to create `_scatter` and `_gather` nodes.
-   **`worker`** `NodeFunction<TContext, TDependencies, TInput, TOutput, TAction> | NodeClass<TContext, TDependencies, TInput, TOutput, TAction>`: The node implementation to run on each item in the input array.
-   **`options`** `{ inputKey: keyof TContext, outputKey: keyof TContext }`:
    -   `inputKey`: The key in the context that holds the input array.
    -   `outputKey`: The key in the context where the array of results will be stored.
-   **Returns**: `this` (for chaining).

### `.wait(id, options?)`

Creates a wait node that pauses workflow execution for external input.

-   **`id`** `string`: A unique identifier for the wait node.
-   **`options?`** `Omit<NodeDefinition, 'id' | 'uses'>`: Optional configuration for the wait node.
-   **Returns**: `this` (for chaining).

### `.sleep(id, options)`

Creates a sleep node that pauses workflow execution for a specified duration.

-   **`id`** `string`: A unique identifier for the sleep node.
-   **`options`** `{ duration: number }`:
    -   `duration`: The duration to sleep in milliseconds.
-   **Returns**: `this` (for chaining).

### `.loop(id, options)`

Creates an iterative loop in the workflow graph.

-   **`id`** `string`: A unique identifier for the loop construct.
-   **`options`** `{ startNodeId: string, endNodeId: string, condition: string }`:
    -   `startNodeId`: The ID of the first node inside the loop body.
    -   `endNodeId`: The ID of the last node inside the loop body.
    -   `condition`: An expression that, if `true`, causes the loop to run again.
-   **Returns**: `this` (for chaining).

### `.toBlueprint()`

Finalizes the definition and returns the serializable [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface).

-   **Returns**: [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface)

#### `WorkflowBlueprint` Interface

The central, serializable representation of a workflow.

```typescript
interface WorkflowBlueprint {
  id: string;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  metadata?: Record<string, any>;
}
```

### `.getFunctionRegistry()`

Returns a `Map` containing the node implementations (`NodeFunction` or `NodeClass`) provided to the builder, keyed by a unique internal identifier. This registry is required by the [`FlowRuntime`](/api/runtime#flowruntime-class).

-   **Returns**: `Map<string, NodeFunction | NodeClass>`

### `.toGraphRepresentation()`

Returns a [`UIGraph`](/api/flow#uigraph-interface) representation of the workflow, optimized for visualization. This method transforms the blueprint by:

-   Replacing loop controllers with direct cyclical edges
-   Replacing batch scatter/gather pairs with a single representative "batch-worker" node
-   Preserving all other nodes and edges

This is useful for UI rendering, debugging, or any scenario where a simplified graph view is needed.

-   **Returns**: [`UIGraph`](/api/flow#uigraph-interface)

#### `UIGraph` Interface

A graph representation of a workflow blueprint for visualization purposes.

```typescript
interface UIGraph {
  nodes: Array<Partial<NodeDefinition> & { id: string; data?: Record<string, any>; type?: string }>;
  edges: Array<Partial<EdgeDefinition> & { source: string; target: string; data?: Record<string, any> }>;
}
```

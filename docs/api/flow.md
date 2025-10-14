# API: Flow

The `Flow` class and `createFlow` function provide a fluent, type-safe API for programmatically building a `WorkflowBlueprint`.

## `createFlow(id)`

Creates and returns a new `Flow` builder instance.

-   **`id`** `string`: A unique identifier for the workflow.
-   **Returns**: `Flow<TContext, TDependencies>`

## `Flow` Class

### `.node(id, implementation, options?)`

Adds a node to the workflow definition.

-   **`id`** `string`: A unique identifier for the node.
-   **`implementation`** `NodeFunction | NodeClass`: The logic for the node.
-   **`options?`** `Omit<NodeDefinition, 'id' | 'uses'>`: Optional configuration for the node, including `inputs`, `params`, and `config`.
-   **Returns**: `this` (for chaining).

### `.edge(source, target, options?)`

Adds an edge to define a dependency between two nodes.

-   **`source`** `string`: The `id` of the source node.
-   **`target`** `string`: The `id` of the target node.
-   **`options?`** `Omit<EdgeDefinition, 'source' | 'target'>`: Optional configuration for the edge, including `action`, `condition`, and `transform`.
-   **Returns**: `this` (for chaining).

### `.batch(id, worker, options)`

Creates a scatter-gather batch processing pattern.

-   **`id`** `string`: A base ID for the batch operation. This will be used to create `_scatter` and `_gather` nodes.
-   **`worker`** `NodeFunction | NodeClass`: The node implementation to run on each item in the input array.
-   **`options`** `{ inputKey: string, outputKey: string }`:
    -   `inputKey`: The key in the context that holds the input array.
    -   `outputKey`: The key in the context where the array of results will be stored.
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

Finalizes the definition and returns the serializable `WorkflowBlueprint`.

-   **Returns**: `WorkflowBlueprint`

### `.getFunctionRegistry()`

Returns a `Map` containing the node implementations (`NodeFunction` or `NodeClass`) provided to the builder, keyed by a unique internal identifier. This registry is required by the `FlowRuntime`.

-   **Returns**: `Map<string, NodeFunction | NodeClass>`

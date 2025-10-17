# Runtime

The [`FlowRuntime`](/api/runtime#flowruntime-class) is the engine that executes workflows.

## `FlowRuntime` Class

### `constructor(options)`

Creates a new runtime instance.

-   **`options`** `RuntimeOptions<TDependencies>`: Configuration for the runtime.
    -   **`registry?`**: A record of globally available node implementations.
    -   **`blueprints?`**: A record of all available blueprints, required for subflow execution.
    -   **`dependencies?`**: Shared dependencies to be injected into every node's context.
    -   **`logger?`**: A pluggable logger instance (defaults to `NullLogger`).
     -   **`eventBus?`**: A pluggable event bus for observability. Emits events such as `workflow:start`, `workflow:finish`, `workflow:stall`, `workflow:pause`, `workflow:resume`, `node:start`, `node:finish`, `node:error`, `node:fallback`, and `node:skipped`.
    -   **`evaluator?`**: A pluggable expression evaluator (defaults to `SimpleEvaluator`).
    -   **`middleware?`**: An array of middleware to wrap node execution.
    -   **`serializer?`**: A pluggable serializer (defaults to `JsonSerializer`).
    -   **`strict?`**: If `true`, the runtime will throw an error if a workflow contains cycles.

### `.run(blueprint, initialState?, options?)`

Executes a workflow.

-   **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow to execute.
-   **`initialState?`** `Partial<TContext> | string`: The initial state for the workflow's context. Can be an object or a serialized string.
 -   **`options?`**:
     -   **`functionRegistry?`**: A `Map` of node implementations, typically from `flow.getFunctionRegistry()`.
     -   **`strict?`**: Overrides the runtime's strict mode setting for this run.
     -   **`signal?`**: An `AbortSignal` to gracefully cancel the workflow execution.
     -   **`concurrency?`**: Limits the number of nodes that can execute simultaneously.
-   **Returns**: `Promise<WorkflowResult<TContext>>`

### `.executeNode(...)`

A lower-level method to execute a single node within a workflow's state. This is primarily used internally by the `GraphTraverser` and `BaseDistributedAdapter`.

### `.determineNextNodes(blueprint, nodeId, result, context, executionId?)`

Determines which nodes should run next based on the result of a completed node and the graph's structure.

-   **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow blueprint.
-   **`nodeId`** `string`: The ID of the completed node.
-   **`result`** [`NodeResult`](/api/flow#noderesult-interface): The result of the completed node.
-   **`context`** [`ContextImplementation`](/api/context): The current context.
-   **`executionId?`** `string`: Optional execution ID for observability events.
-   **Returns**: `Promise<{ node: NodeDefinition; edge: EdgeDefinition }[]>`

### `.applyEdgeTransform(...)`

Applies an edge's `transform` expression to the data flowing between two nodes.

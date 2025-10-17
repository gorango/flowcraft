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
     -   **`eventBus?`**: A pluggable event bus for observability. See [Event Bus](#event-bus) for details on available events.
    -   **`evaluator?`**: A pluggable expression evaluator (defaults to `SimpleEvaluator`).
    -   **`middleware?`**: An array of middleware to wrap node execution.
    -   **`serializer?`**: A pluggable serializer (defaults to `JsonSerializer`).
    -   **`strict?`**: If `true`, the runtime will throw an error if a workflow contains cycles.

## Event Bus

The runtime emits structured events through the `IEventBus` interface for observability and debugging. These events provide detailed information about workflow execution, including data flow, decision logic, and error conditions.

### `FlowcraftEvent` Type

All events follow this structured format:

```typescript
export type FlowcraftEvent =
  | { type: 'workflow:start'; payload: { blueprintId: string; executionId: string } }
  | { type: 'workflow:finish'; payload: { blueprintId: string; executionId: string; status: string; errors?: WorkflowError[] } }
  | { type: 'workflow:stall'; payload: { blueprintId: string; executionId: string; remainingNodes: number } }
  | { type: 'workflow:pause'; payload: { blueprintId: string; executionId: string } }
  | { type: 'workflow:resume'; payload: { blueprintId: string; executionId: string } }
  | { type: 'node:start'; payload: { nodeId: string; executionId: string; input: any; blueprintId: string } }
  | { type: 'node:finish'; payload: { nodeId: string; result: NodeResult; executionId: string; blueprintId: string } }
  | { type: 'node:error'; payload: { nodeId: string; error: FlowcraftError; executionId: string; blueprintId: string } }
  | { type: 'node:fallback'; payload: { nodeId: string; executionId: string; fallback: string; blueprintId: string } }
  | { type: 'node:retry'; payload: { nodeId: string; attempt: number; executionId: string; blueprintId: string } }
  | { type: 'node:skipped'; payload: { nodeId: string; edge: EdgeDefinition; executionId: string; blueprintId: string } }
  | { type: 'edge:evaluate'; payload: { source: string; target: string; condition?: string; result: boolean } }
  | { type: 'context:change'; payload: { sourceNode: string; key: string; value: any } }
```

### `IEventBus` Interface

```typescript
export interface IEventBus {
  emit: (event: FlowcraftEvent) => void | Promise<void>
}
```

### Event Descriptions

- **`workflow:start`**: Emitted when a workflow execution begins.
- **`workflow:finish`**: Emitted when a workflow completes, fails, or is cancelled.
- **`workflow:stall`**: Emitted when a workflow cannot proceed (e.g., due to unresolved dependencies).
- **`workflow:pause`**: Emitted when a workflow is paused (e.g., due to cancellation or stalling).
- **`workflow:resume`**: Emitted when a workflow resumes execution.
- **`node:start`**: Emitted when a node begins execution, including the resolved input.
- **`node:finish`**: Emitted when a node completes successfully.
- **`node:error`**: Emitted when a node fails.
- **`node:fallback`**: Emitted when a fallback node is executed.
- **`node:retry`**: Emitted when a node execution is retried.
- **`node:skipped`**: Emitted when a conditional edge is not taken.
- **`edge:evaluate`**: Emitted when an edge condition is evaluated, showing the condition and result.
- **`context:change`**: Emitted when data is written to the workflow context.

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

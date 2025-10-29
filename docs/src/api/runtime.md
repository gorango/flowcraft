# Runtime

The [`FlowRuntime`](/api/runtime#flowruntime-class) is the engine that executes workflows.

## `FlowRuntime` Class

### `constructor(container, options?)` or `constructor(options)`

Creates a new runtime instance using a Dependency Injection (DI) container or legacy options for backward compatibility.

#### DI Constructor (Recommended)

-   **`container`** [`DIContainer`](/api/container#dicontainer-class): A pre-configured dependency injection container that provides all runtime services.
-   **`options?`** `RuntimeOptions<TDependencies>`: Optional legacy configuration (for backward compatibility).

#### Legacy Constructor (Backward Compatible)

-   **`options`** `RuntimeOptions<TDependencies>`: Configuration for the runtime.
     -   **`registry?`**: A record of globally available node implementations.
     -   **`blueprints?`**: A record of all available blueprints, required for subflow execution.
     -   **`dependencies?`**: Shared dependencies to be injected into every node's context.
     -   **`logger?`**: A pluggable logger instance (defaults to `NullLogger`).
     -   **`eventBus?`**: A pluggable event bus for observability. See [Event Bus](#event-bus) for details on available events.
     -   **`evaluator?`**: A pluggable expression evaluator (defaults to `PropertyEvaluator`).
     -   **`middleware?`**: An array of middleware to wrap node execution.
     -   **`serializer?`**: A pluggable serializer (defaults to `JsonSerializer`).
     -   **`strict?`**: If `true`, the runtime will throw an error if a workflow contains cycles.

**Note:** The legacy constructor is maintained for backward compatibility. For new code, use the DI container approach for better modularity and testability.

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
  | { type: 'context:change'; payload: { sourceNode: string; key: string; op: 'set' | 'delete'; value?: any } }
  | { type: 'batch:start'; payload: { batchId: string; scatterNodeId: string; workerNodeIds: string[] } }
  | { type: 'batch:finish'; payload: { batchId: string; gatherNodeId: string; results: any[] } }
  | { type: 'job:enqueued'; payload: { runId: string; blueprintId: string; nodeId: string; queueName?: string } }
  | { type: 'job:processed'; payload: { runId: string; blueprintId: string; nodeId: string; result: NodeResult } }
  | { type: 'job:failed'; payload: { runId: string; blueprintId: string; nodeId: string; error: FlowcraftError } }
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
- **`context:change`**: Emitted when data is written to or deleted from the workflow context.
- **`batch:start`**: Emitted when a batch operation begins.
- **`batch:finish`**: Emitted when a batch operation completes.
- **`job:enqueued`**: Emitted when a job is enqueued for distributed processing.
- **`job:processed`**: Emitted when a distributed job completes successfully.
- **`job:failed`**: Emitted when a distributed job fails.

### `.run(blueprint, initialState?, options?)`

Executes a workflow using the `DefaultOrchestrator`, which can handle both standard and Human-in-the-Loop (HITL) workflows.

-   **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow to execute.
-   **`initialState?`** `Partial<TContext> | string`: The initial state for the workflow's context. Can be an object or a serialized string.
  -   **`options?`**:
      -   **`functionRegistry?`**: A `Map` of node implementations, typically from `flow.getFunctionRegistry()`.
      -   **`strict?`**: Overrides the runtime's strict mode setting for this run.
      -   **`signal?`**: An `AbortSignal` to gracefully cancel the workflow execution.
      -   **`concurrency?`**: Limits the number of nodes that can execute simultaneously.
-   **Returns**: `Promise<WorkflowResult<TContext>>`

### `.resume(blueprint, serializedContext, resumeData, options?)`

Resumes an awaiting workflow from its pause point.

-   **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow blueprint.
-   **`serializedContext`** `string`: The serialized context from an awaiting workflow result.
-   **`resumeData`** `{ output?: any; action?: string }`: Data to provide to the awaiting node.
-   **`options?`**: Same as for `.run()`.
-   **Returns**: `Promise<WorkflowResult<TContext>>`

### `.replay(blueprint, events, executionId?)`

Replays a workflow execution from a pre-recorded event history, reconstructing the final workflow state without re-executing node logic. This enables time-travel debugging and post-mortem analysis.

-   **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow blueprint.
-   **`events`** `FlowcraftEvent[]`: The recorded event history for the execution.
-   **`executionId?`** `string`: Optional execution ID to filter events (if events contain multiple executions).
-   **Returns**: `Promise<WorkflowResult<TContext>>`

The replay system processes these event types to reconstruct state:
- `node:finish`: Applies completed node outputs to context
- `context:change`: Applies context modifications (including user `context.set()` and `context.delete()` calls)
- `node:error`: Records errors in the workflow state
- `workflow:finish`: Marks workflow completion

Replay always produces a "completed" status since it reconstructs the final state without re-executing logic.

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

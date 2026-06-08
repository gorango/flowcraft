# Runtime

The [`FlowRuntime`](/api/runtime#flowruntime-class) is the engine that executes workflows.

## `FlowRuntime` Class

### `constructor(container, options?)` or `constructor(options)`

Creates a new runtime instance using a Dependency Injection (DI) container or legacy options for backward compatibility.

#### DI Constructor (Recommended)

- **`container`** [`DIContainer`](/api/container#dicontainer-class): A pre-configured dependency injection container that provides all runtime services.
- **`options?`** `RuntimeOptions<TDependencies>`: Optional legacy configuration (for backward compatibility).

#### Legacy Constructor (Backward Compatible)

- **`options`** `RuntimeOptions<TDependencies>`: Configuration for the runtime.
  - **`registry?`**: A record of globally available node implementations.
  - **`blueprints?`**: A record of all available blueprints, required for subflow execution.
  - **`dependencies?`**: Shared dependencies to be injected into every node's context.
  - **`logger?`**: A pluggable logger instance (defaults to `NullLogger`).
  - **`eventBus?`**: A pluggable event bus for observability. See [Event Bus](#event-bus) for details on available events.
  - **`evaluator?`**: A pluggable expression evaluator (defaults to `PropertyEvaluator`).
  - **`middleware?`**: An array of middleware to wrap node execution.
  - **`serializer?`**: A pluggable serializer (defaults to `JsonSerializer`).
  - **`strict?`**: If `true`, the runtime will throw an error if a workflow contains cycles.

**Note:** The legacy constructor is maintained for backward compatibility. For new code, use the DI container approach for better modularity and testability.

## Event Bus

The runtime emits structured events through the `IEventBus` interface for observability and debugging. These events provide detailed information about workflow execution, including data flow, decision logic, and error conditions.

### `FlowcraftEvent` Type

All events follow this structured format:

```typescript
export type FlowcraftEvent =
	| { type: 'workflow:start'; payload: { blueprintId: string; executionId: string } }
	| {
			type: 'workflow:finish'
			payload: {
				blueprintId: string
				executionId: string
				status: string
				errors?: WorkflowError[]
			}
	  }
	| {
			type: 'workflow:stall'
			payload: { blueprintId: string; executionId: string; remainingNodes: number }
	  }
	| { type: 'workflow:pause'; payload: { blueprintId: string; executionId: string } }
	| { type: 'workflow:resume'; payload: { blueprintId: string; executionId: string } }
	| {
			type: 'node:start'
			payload: { nodeId: string; executionId: string; input: any; blueprintId: string }
	  }
	| {
			type: 'node:finish'
			payload: {
				nodeId: string
				result: NodeResult
				executionId: string
				blueprintId: string
			}
	  }
	| {
			type: 'node:error'
			payload: {
				nodeId: string
				error: FlowcraftError
				executionId: string
				blueprintId: string
			}
	  }
	| {
			type: 'node:fallback'
			payload: { nodeId: string; executionId: string; fallback: string; blueprintId: string }
	  }
	| {
			type: 'node:retry'
			payload: { nodeId: string; attempt: number; executionId: string; blueprintId: string }
	  }
	| {
			type: 'node:skipped'
			payload: {
				nodeId: string
				edge: EdgeDefinition
				executionId: string
				blueprintId: string
			}
	  }
	| {
			type: 'edge:evaluate'
			payload: { source: string; target: string; condition?: string; result: boolean }
	  }
	| {
			type: 'context:change'
			payload: { sourceNode: string; key: string; op: 'set' | 'delete'; value?: any }
	  }
	| {
			type: 'batch:start'
			payload: { batchId: string; scatterNodeId: string; workerNodeIds: string[] }
	  }
	| { type: 'batch:finish'; payload: { batchId: string; gatherNodeId: string; results: any[] } }
	| {
			type: 'job:enqueued'
			payload: { runId: string; blueprintId: string; nodeId: string; queueName?: string }
	  }
	| {
			type: 'job:processed'
			payload: { runId: string; blueprintId: string; nodeId: string; result: NodeResult }
	  }
	| {
			type: 'job:failed'
			payload: { runId: string; blueprintId: string; nodeId: string; error: FlowcraftError }
	  }
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

- **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow to execute.
- **`initialState?`** `Partial<TContext> | string`: The initial state for the workflow's context. Can be an object or a serialized string.
- **`options?`**:
  - **`functionRegistry?`**: A `Map` of node implementations, typically from `flow.getFunctionRegistry()`.
  - **`strict?`**: Overrides the runtime's strict mode setting for this run.
  - **`signal?`**: An `AbortSignal` to gracefully cancel the workflow execution.
  - **`concurrency?`**: Limits the number of nodes that can execute simultaneously.
- **Returns**: `Promise<WorkflowResult<TContext>>`

### `.resume(blueprint, serializedContext, resumeData, options?)`

Resumes an awaiting workflow from its pause point.

- **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow blueprint.
- **`serializedContext`** `string`: The serialized context from an awaiting workflow result.
- **`resumeData`** `{ output?: any; action?: string }`: Data to provide to the awaiting node.
- **`options?`**: Same as for `.run()`.
- **Returns**: `Promise<WorkflowResult<TContext>>`

### `.replay(blueprint, events, executionId?)`

Replays a workflow execution from a pre-recorded event history, reconstructing the final workflow state without re-executing node logic. This enables time-travel debugging and post-mortem analysis.

- **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow blueprint.
- **`events`** `FlowcraftEvent[]`: The recorded event history for the execution.
- **`executionId?`** `string`: Optional execution ID to filter events (if events contain multiple executions).
- **Returns**: `Promise<WorkflowResult<TContext>>`

The replay system processes these event types to reconstruct state:

- `node:finish`: Applies completed node outputs to context
- `context:change`: Applies context modifications (including user `context.set()` and `context.delete()` calls)
- `node:error`: Records errors in the workflow state
- `workflow:finish`: Marks workflow completion

Replay always produces a "completed" status since it reconstructs the final state without re-executing logic.

### `.executeNodes(blueprint, executionId, nodeIds, events, options?)`

Executes a specific set of nodes within a workflow, reconstructing state from a pre-recorded event history. Useful for debugging, re-running failed nodes, or selectively executing a subset of a workflow.

- **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow blueprint.
- **`executionId`** `string`: The execution ID for the run.
- **`nodeIds`** `string[]`: An array of node IDs to execute in order.
- **`events`** `FlowcraftEvent[]`: Historical events to reconstruct initial context from.
- **`options?`**:
  - **`inputOverrides?`**: A record of node ID to input value overrides.
  - **`signal?`**: An `AbortSignal` to cancel execution.
  - **`functionRegistry?`**: A `Map` of node implementations.
- **Returns**: `Promise<WorkflowResult<TContext>>`

This method: 1) Reconstructs context from `context:change` events; 2) builds a predecessor map for edge transform resolution; 3) Executes each node sequentially; 4) Propagates outputs through edge transforms; 5) Emits `node:start`, `node:finish`, and `node:error` events

### `.patchContext(blueprint, executionId, events, patches)`

Modifies context values mid-execution by reconstructing state from a pre-recorded event history and applying patch operations. Useful for debugging, correcting workflow state, or building tools that manipulate execution context.

- **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow blueprint.
- **`executionId`** `string`: The execution ID to patch.
- **`events`** `FlowcraftEvent[]`: Historical events to reconstruct the current context state from.
- **`patches`** `Array<{ key: string; value: unknown; op: 'set' | 'delete' }>`: Context modifications to apply.
- **Returns**: `Promise<WorkflowResult<TContext>>`

This method: 1) Reconstructs context from `context:change` and `node:finish` events; 2) Creates a new `WorkflowState` from the reconstructed data; 3) Applies each patch via the async context (which emits `context:change` events); 4) Returns the updated workflow result.

```typescript
const result = await runtime.patchContext(blueprint, executionId, events, [
	{ key: 'userEmail', value: 'updated@example.com', op: 'set' },
	{ key: 'tempData', value: undefined, op: 'delete' },
])
```

### `.markNodeCompleted(blueprint, executionId, nodeId, output)`

Manually marks a node as completed with a synthetic output, without executing its logic. Unlike `executeNodes()`, this does NOT emit `node:start` — only `node:finish`. Edge transforms are propagated to downstream nodes so their inputs are populated correctly.

- **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow blueprint.
- **`executionId`** `string`: The execution ID.
- **`nodeId`** `string`: The node to mark as completed.
- **`output`** `unknown`: The synthetic output to store.
- **Returns**: `Promise<WorkflowResult<TContext>>`

Throws `FlowcraftError` if the node does not exist in the blueprint. Clears any existing error state on the node before marking it complete.

```typescript
// Skip a node by providing a synthetic output
const result = await runtime.markNodeCompleted(blueprint, executionId, 'optionalStep', {
	skipped: true,
})
```

### `.requestPause(executionId)`

Sets a pause flag for a running execution. The orchestrator checks this flag between node iterations and will pause at the next safe checkpoint by marking the first uncompleted node as awaiting.

- **`executionId`** `string`: The execution to pause.
- **Returns**: `void`

The paused workflow can be resumed later via `.resume()`. This is the mechanism behind programmatic pause points and human-in-the-loop breakpoints.

```typescript
// During execution, request a pause
runtime.requestPause(executionId)
// The orchestrator will pause at the next node boundary
// Then resume later
const resumed = await runtime.resume(blueprint, serializedContext, { output: 'continue' })
```

### `.rollbackExecution(blueprint, executionId, events, targetNodeId)`

Undoes context mutations for nodes completed **after** a target node, effectively reverting execution state to that point. This is a "soft" rollback — it removes outputs, inputs, and errors from context but cannot undo side effects (API calls, database writes, etc.) that occurred during node execution.

- **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow blueprint.
- **`executionId`** `string`: The execution ID.
- **`events`** `FlowcraftEvent[]`: Historical events to reconstruct the current context state from.
- **`targetNodeId`** `string`: The node to rollback to (this node remains completed).
- **Returns**: `Promise<WorkflowResult<TContext>>`

Throws `FlowcraftError` if the target node has not completed. Uses BFS to find all downstream nodes from the target, then removes their `_outputs`, `_inputs`, and error entries from context.

```typescript
// Rollback to node B, removing C and D's effects
const result = await runtime.rollbackExecution(blueprint, executionId, events, 'B')
// result.context['_outputs.B'] is preserved
// result.context['_outputs.C'] is undefined
```

### `.replayFrom(blueprint, events, fromNodeId, options?)`

Replays execution from a specific node with optional input overrides. Reconstructs state from events, pre-populates ancestor node outputs as initial state, then runs the workflow via `.run()` from that point.

- **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow blueprint.
- **`events`** `FlowcraftEvent[]`: The full event history.
- **`fromNodeId`** `string`: The node to replay from (must exist in the blueprint).
- **`options?`**:
  - **`inputOverrides?`**: `Record<string, unknown>` — values to inject into the initial context.
  - **`functionRegistry?`**: A `Map` of node implementations.
  - **`signal?`**: An `AbortSignal` to cancel execution.
- **Returns**: `Promise<WorkflowResult<TContext>>`

Throws `FlowcraftError` if the node does not exist in the blueprint. Ancestor outputs (nodes that are predecessors of `fromNodeId`) are pre-populated so downstream nodes receive correct inputs.

```typescript
// Replay from the point of failure with corrected input
const result = await runtime.replayFrom(blueprint, events, 'processData', {
	inputOverrides: { inputData: correctedData },
	functionRegistry: flow.getFunctionRegistry(),
})
```

### `.startScheduler(checkIntervalMs?)`

Starts the internal [`WorkflowScheduler`](/api/runtime#workflowscheduler) that monitors awaiting workflows and automatically resumes them when their timers expire. Required for `sleep` nodes to function in in-memory workflows.

- **`checkIntervalMs?`** `number`: How often (in ms) to check for expired timers. Defaults to `1000`.

```typescript
const runtime = new FlowRuntime()
runtime.startScheduler()
// sleep nodes will now auto-resume
```

### `.stopScheduler()`

Stops the internal scheduler. Call this when shutting down to clean up the polling interval.

### `scheduler`

The runtime's [`WorkflowScheduler`](/api/runtime#workflowscheduler) instance. Use it to inspect active workflows and retrieve auto-resumed results.

## `WorkflowScheduler`

Manages awaiting workflows that have timer-based pauses (sleep nodes). The scheduler polls at a configurable interval and calls `runtime.resume()` automatically when a workflow's timer expires.

### `.getActiveWorkflows()`

Returns a list of currently awaiting workflows being tracked by the scheduler.

- **Returns**: `AwaitingWorkflow[]`

### `.getResumeResult(executionId)`

Retrieves the `WorkflowResult` from a workflow that was automatically resumed by the scheduler. Results are stored after each auto-resume and can be looked up by execution ID.

- **`executionId`** `string`: The execution ID, available from `result.context._executionId` after the initial `run()`.
- **Returns**: `WorkflowResult | undefined`

```typescript
const result = await flow.run(runtime)
// result.status === 'awaiting'

// ... scheduler auto-resumes when timer expires ...

const executionId = result.context._executionId as string
const resumed = runtime.scheduler.getResumeResult(executionId)
// resumed.status === 'completed'
```

### `.executeNode(...)`

A lower-level method to execute a single node within a workflow's state. This is primarily used internally by the `GraphTraverser` and `BaseDistributedAdapter`.

### `.determineNextNodes(blueprint, nodeId, result, context, executionId?)`

Determines which nodes should run next based on the result of a completed node and the graph's structure.

- **`blueprint`** [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface): The workflow blueprint.
- **`nodeId`** `string`: The ID of the completed node.
- **`result`** [`NodeResult`](/api/flow#noderesult-interface): The result of the completed node.
- **`context`** [`ContextImplementation`](/api/context): The current context.
- **`executionId?`** `string`: Optional execution ID for observability events.
- **Returns**: `Promise<{ node: NodeDefinition; edge: EdgeDefinition }[]>`

### `.applyEdgeTransform(...)`

Applies an edge's `transform` expression to the data flowing between two nodes.

# Flow

The [`Flow`](/api/flow#flow-class) class and `createFlow` function provide a fluent, type-safe API for programmatically building a [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface).

The `sleep`, `waitForEvent`, and `createWebhook` functions provide durable primitives for use within compiler-transformed workflows.

## `createFlow(id)`

Creates and returns a new [`Flow`](/api/flow#flow-class) builder instance.

- **`id`** `string`: A unique identifier for the workflow.
- **Returns**: `Flow<TContext, TDependencies>`

## Durable Primitives

The `sleep`, `waitForEvent`, and `createWebhook` functions provide durable primitives that can be used within `@flow`-tagged functions. These primitives are automatically transformed by the compiler into appropriate runtime nodes.

### `sleep(duration)`

Pauses workflow execution for a specified duration and automatically resumes when the timer expires.

- **`duration`** `number | string`: The duration to sleep. Can be a number (milliseconds) or a string with units (e.g., `'5m'`, `'2h'`, `'30s'`).
- **Returns**: `Promise<void>`

**Example:**

```typescript
import { sleep } from 'flowcraft/sdk'

/** @flow */
export async function delayedWorkflow() {
	await sleep('5m') // Sleep for 5 minutes
	return { status: 'completed' }
}
```

### `waitForEvent<T>(eventName)`

Pauses workflow execution until an external event is received.

- **`eventName`** `string`: The name of the event to wait for.
- **Returns**: `Promise<T>` - Resolves with the event data when received.

**Example:**

```typescript
import { waitForEvent } from 'flowcraft/sdk'

/** @flow */
export async function eventWorkflow() {
	const eventData = await waitForEvent<{ userId: string }>('user_action')
	return { userId: eventData.userId }
}
```

### `createWebhook<T>()`

Creates a webhook endpoint and returns an object that can be used to wait for webhook calls.

- **Returns**: `Promise<Webhook<T>>` - Resolves to a webhook object.

**Webhook Interface:**

```typescript
interface Webhook<T> {
	url: string // The public URL to POST to
	event: string // Unique event name for routing
	request: Promise<{
		// Resolves when webhook is called
		json(): Promise<T>
		text(): Promise<string>
		headers: Record<string, string>
	}>
}
```

**Example:**

```typescript
import { createWebhook } from 'flowcraft/sdk'

/** @flow */
export async function webhookWorkflow() {
	const webhook = await createWebhook<{ data: string }>()

	// Send webhook.url to external service
	console.log('Webhook URL:', webhook.url)

	// Wait for webhook call
	const request = await webhook.request
	const payload = await request.json()

	return { payload }
}
```

**Note:** These functions should only be used within `@flow`-tagged functions. They are automatically transformed by the compiler and will show warnings if used outside this context.

## `Flow` Class

### `.node<TInput, TOutput, TAction>(id, implementation, options?)`

Adds a node to the workflow definition with full type safety.

- **`id`** `string`: A unique identifier for the node.
- **`implementation`** `NodeFunction<TContext, TDependencies, TInput, TOutput, TAction> | NodeClass<TContext, TDependencies, TInput, TOutput, TAction>`: The logic for the node.
- **`options?`** `Omit<NodeDefinition, 'id' | 'uses'>`: Optional configuration for the node, including `inputs`, `params`, and `config`.
- **Returns**: `this` (for chaining).

**Type-safe Example:**

```typescript
flow.node<{ id: string }, { status: 'ok' }, 'done'>('process', async ({ input }) => {
	return { output: { status: 'ok' }, action: 'done' }
})
```

### `.edge(source, target, options?)`

Adds an edge to define a dependency between two nodes.

- **`source`** `string`: The `id` of the source node.
- **`target`** `string`: The `id` of the target node.
- **`options?`** `Omit<EdgeDefinition, 'source' | 'target'>`: Optional configuration for the edge, including `action`, `condition`, and `transform`.
- **Returns**: `this` (for chaining).

### `.batch<TInput, TOutput, TAction>(id, worker, options)`

Creates a scatter-gather batch processing pattern with full type safety.

- **`id`** `string`: A base ID for the batch operation. This will be used to create `_scatter` and `_gather` nodes.
- **`worker`** `NodeFunction<TContext, TDependencies, TInput, TOutput, TAction> | NodeClass<TContext, TDependencies, TInput, TOutput, TAction>`: The node implementation to run on each item in the input array.
- **`options`** `{ inputKey: keyof TContext, outputKey?: keyof TContext }`:
  - `inputKey`: The key in the context that holds the input array.
  - `outputKey` (optional): The key in the context where the array of results will be stored. Defaults to the gather node ID (`${id}_gather`).
- **Returns**: `this` (for chaining).

### `.wait(id, options?)`

Creates a wait node that pauses workflow execution for external input.

- **`id`** `string`: A unique identifier for the wait node.
- **`options?`** `Omit<NodeDefinition, 'id' | 'uses'>`: Optional configuration for the wait node.
- **Returns**: `this` (for chaining).

### `.sleep(id, options)`

Creates a sleep node that pauses workflow execution for a specified duration.

- **`id`** `string`: A unique identifier for the sleep node.
- **`options`** `{ duration: number }`:
  - `duration`: The duration to sleep in milliseconds.
- **Returns**: `this` (for chaining).

### `.loop(id, options)`

Creates an iterative loop in the workflow graph.

- **`id`** `string`: A unique identifier for the loop construct.
- **`options`** `{ startNodeId: string, endNodeId: string, condition: string }`:
  - `startNodeId`: The ID of the first node inside the loop body.
  - `endNodeId`: The ID of the last node inside the loop body.
  - `condition`: An expression that, if `true`, causes the loop to run again.
- **Returns**: `this` (for chaining).

### `.toBlueprint()`

Finalizes the definition and returns the serializable [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface).

- **Returns**: [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface)

#### `WorkflowBlueprint` Interface

The central, serializable representation of a workflow.

```typescript
interface WorkflowBlueprint {
	id: string
	nodes: NodeDefinition[]
	edges: EdgeDefinition[]
	metadata?: WorkflowBlueprintMetadata
}
```

### `.getFunctionRegistry()`

Returns a `Map` containing the node implementations (`NodeFunction` or `NodeClass`) provided to the builder, keyed by a unique internal identifier. This registry is required by the [`FlowRuntime`](/api/runtime#flowruntime-class).

- **Returns**: `Map<string, NodeFunction | NodeClass>`

### `.run(runtime, initialState?, options?)`

Runs this flow on the given runtime, automatically passing the function registry. This is a convenience wrapper around `runtime.run(blueprint, initialState, { functionRegistry })`.

- **`runtime`** [`FlowRuntime`](/api/runtime#flowruntime-class): The runtime to execute on.
- **`initialState?`** `Partial<TContext> | string`: The initial state for the workflow's context.
- **`options?`** `{ strict?: boolean, signal?: AbortSignal, concurrency?: number }`: Runtime options (excluding `functionRegistry`, which is provided automatically).
- **Returns**: `Promise<WorkflowResult<TContext>>`

**Before:**

```typescript
const blueprint = flow.toBlueprint()
const result = await runtime.run(
	blueprint,
	{},
	{
		functionRegistry: flow.getFunctionRegistry(),
	},
)
```

**After:**

```typescript
const result = await flow.run(runtime)
```

### `.resume(runtime, serializedContext, resumeData, nodeId?, options?)`

Resumes this flow on the given runtime, automatically passing the function registry. This is a convenience wrapper around `runtime.resume(blueprint, serializedContext, resumeData, nodeId, { functionRegistry })`.

- **`runtime`** [`FlowRuntime`](/api/runtime#flowruntime-class): The runtime to execute on.
- **`serializedContext`** `string`: The serialized context from an awaiting workflow result.
- **`resumeData`** `{ output?: any; action?: string }`: Data to provide to the awaiting node.
- **`nodeId?`** `string`: The ID of the node to resume. Defaults to the first awaiting node.
- **`options?`** `{ strict?: boolean, signal?: AbortSignal, concurrency?: number }`: Runtime options.
- **Returns**: `Promise<WorkflowResult<TContext>>`

**Before:**

```typescript
const result = await runtime.resume(
	blueprint,
	serializedContext,
	{ output: { approved: true } },
	'wait-for-approval',
	{ functionRegistry: flow.getFunctionRegistry() },
)
```

**After:**

```typescript
const result = await flow.resume(
	runtime,
	serializedContext,
	{ output: { approved: true } },
	'wait-for-approval',
)
```

### `.toGraphRepresentation()`

Returns a [`UIGraph`](/api/flow#uigraph-interface) representation of the workflow, optimized for visualization. This method transforms the blueprint by:

- Replacing loop controllers with direct cyclical edges
- Replacing batch scatter/gather pairs with a single representative "batch-worker" node
- Preserving all other nodes and edges

This is useful for UI rendering, debugging, or any scenario where a simplified graph view is needed.

- **Returns**: [`UIGraph`](/api/flow#uigraph-interface)

#### `UIGraph` Interface

A graph representation of a workflow blueprint for visualization purposes.

```typescript
interface UIGraph {
	nodes: Array<Partial<NodeDefinition> & { id: string; data?: Record<string, any>; type?: string }>
	edges: Array<
		Partial<EdgeDefinition> & { source: string; target: string; data?: Record<string, any> }
	>
}
```

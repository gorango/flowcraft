# Context Management

The **Context** is the shared memory of a single workflow execution. It allows nodes to pass data to each other, even if they are not directly connected.

### How it Works

The context is a simple key-value store. By convention, when a node completes, the `FlowRuntime` automatically saves its `output` to the context using the node's `id` as the key.

```typescript
const flow = createFlow('state-example')
// This node's output will be saved as `context.initial_data`
	.node('initial_data', async () => ({ output: { value: 100 } }))

// This node has no direct input from its predecessor, but it can still
// access the data from the context.
	.node('process_data', async ({ context }) => {
		// We can read the output of the 'initial_data' node
		const data = await context.get('initial_data') // { value: 100 }
		const processed = data.value * 2
		return { output: processed }
	})
	.edge('initial_data', 'process_data')
```

After this workflow runs, the final context will be:
```json
{
	"initial_data": { "value": 100 },
	"process_data": 200
}
```

### The Context API

Inside any node implementation (both function and class-based), you get access to the `context` object, which provides a consistent, asynchronous API for state manipulation.

-   **`context.get(key)`**: Retrieves a value from the context. Returns a `Promise`.
-   **`context.set(key, value)`**: Sets a value in the context. Returns a `Promise`.
-   **`context.has(key)`**: Checks if a key exists. Returns a `Promise<boolean>`.
-   **`context.delete(key)`**: Deletes a key. Returns a `Promise<boolean>`.

Using this API, you can build complex, stateful workflows that accumulate data over time.

#### Example: Accumulating State

This workflow simulates a counter that increments with each step.

```typescript
const flow = createFlow('stateful-workflow')
	.node('step1', async ({ context }) => {
		// Initialize the counter in the context
		await context.set('count', 1)
		return { output: 'Step 1 complete' }
	})
	.node('step2', async ({ context }) => {
		// Read the current count
		const currentCount = await context.get('count')
		// Increment and save it back
		const newCount = (currentCount || 0) + 1
		await context.set('count', newCount)
		return { output: 'Step 2 complete' }
	})
	.edge('step1', 'step2')
	.toBlueprint()
```

After execution, the final context will contain `count: 2`.

### Sync vs. Async Context

Flowcraft has two internal context implementations:
-   **`ISyncContext` (`Context`)**: An in-memory `Map`-based implementation used by the default in-memory runtime. It's fast and simple.
-   **`IAsyncContext`**: An `async` interface for contexts that might store state remotely (e.g., in Redis). This is used for distributed execution.

Your node logic **always** interacts with the `IAsyncContext` view. This is a powerful design choice that means your node code doesn't need to change when you scale from a local runner to a distributed one.

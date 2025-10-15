# Context Management

The **Context** is the shared, strongly-typed memory of a single workflow execution. It allows nodes to pass data to each other with compile-time type safety, even if they are not directly connected.

## Defining Context Types

Before creating workflows, define the shape of your context data using a TypeScript interface:

```typescript
interface SearchWorkflowContext {
  query: string
  search_results: SearchResult[]
  final_answer?: string
  metadata: {
    startTime: Date
    userId: string
  }
}
```

## How it Works

The context is a strongly-typed key-value store. When a node completes, the `FlowRuntime` automatically saves its `output` to the context using the node's `id` as the key.

```typescript
const flow = createFlow<SearchWorkflowContext>('state-example')
	// This node's output will be saved as `context.initial_data`
	.node('initial_data', async () => ({ output: { value: 100 } }))

	// This node has no direct input from its predecessor, but it can still
	// access the data from the context with full type safety.
	.node('process_data', async ({ context }) => {
		// ✅ Type-safe access with autocomplete
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

## The Strongly-Typed Context API

Inside any node implementation, you get access to the `context` object, which provides a consistent, asynchronous API with full type safety:

-   **`context.get<K>(key)`**: Retrieves a value with precise typing. `K` is constrained to `keyof TContext`.
-   **`context.set<K>(key, value)`**: Sets a value with type checking. `value` must match `TContext[K]`.
-   **`context.has<K>(key)`**: Checks if a key exists with type safety.
-   **`context.delete<K>(key)`**: Deletes a key with type safety.

### Type Safety Benefits

```typescript
// ✅ Compile-time key validation
const query = await context.get('query') // string | undefined

// ✅ Precise return types
const results = await context.get('search_results') // SearchResult[] | undefined

// ✅ Type-safe value assignment
await context.set('final_answer', 'Found 5 results')

// ❌ Compile-time error: 'invalid_key' not in SearchWorkflowContext
await context.get('invalid_key')

// ❌ Compile-time error: wrong type
await context.set('query', 123) // Expected string, got number
```

## Example: Strongly-Typed Stateful Workflow

This workflow demonstrates type-safe state accumulation:

```typescript
interface CounterContext {
  count: number
  history: string[]
}

const flow = createFlow<CounterContext>('stateful-workflow')
	.node('step1', async ({ context }) => {
		// ✅ Type-safe initialization
		await context.set('count', 1)
		await context.set('history', ['Step 1 started'])
		return { output: 'Step 1 complete' }
	})
	.node('step2', async ({ context }) => {
		// ✅ Type-safe reading and writing
		const currentCount = await context.get('count') || 0
		const history = await context.get('history') || []

		const newCount = currentCount + 1
		const newHistory = [...history, `Step 2: count is now ${newCount}`]

		await context.set('count', newCount)
		await context.set('history', newHistory)
		return { output: 'Step 2 complete' }
	})
	.edge('step1', 'step2')
```

After execution, the final context will contain `count: 2` and `history: ['Step 1 started', 'Step 2: count is now 2']` with full type safety.

## Sync vs. Async Context

Flowcraft has two internal context implementations:
-   **`ISyncContext<TContext>` (`Context<TContext>`)**: An in-memory `Map`-based implementation used by the default in-memory runtime. Provides full type safety.
-   **`IAsyncContext<TContext>`**: An `async` interface for contexts that might store state remotely (e.g., in Redis). Used for distributed execution with maintained type safety.

Your node logic **always** interacts with the `IAsyncContext<TContext>` view. This ensures your node code works consistently whether running locally or in a distributed environment, with full type safety in both cases.

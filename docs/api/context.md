# Context

The context is the state management system for a workflow execution. Flowcraft provides strongly-typed interfaces for both synchronous (in-memory) and asynchronous (distributed) state with compile-time type safety.

## `ISyncContext` Interface

The synchronous context interface for high-performance, in-memory state with key-level type safety.

```typescript
interface ISyncContext<TContext extends Record<string, any> = Record<string, any>> {
	readonly type: 'sync'
	get: <K extends keyof TContext>(key: K) => TContext[K] | undefined
	set: <K extends keyof TContext>(key: K, value: TContext[K]) => void
	has: <K extends keyof TContext>(key: K) => boolean
	delete: <K extends keyof TContext>(key: K) => boolean
	toJSON: () => Record<string, any>
}
```

### `Context` Class

The default, high-performance, in-memory implementation of `ISyncContext`, backed by a `Map`.

-   **`new Context<TContext>(initialData?)`**: Creates a new context with full type safety, optionally seeding it with initial data.

## `IAsyncContext` Interface

The asynchronous context interface for remote or distributed state with key-level type safety. Node logic always interacts with this interface.

```typescript
interface IAsyncContext<TContext extends Record<string, any> = Record<string, any>> {
	readonly type: 'async'
	get: <K extends keyof TContext>(key: K) => Promise<TContext[K] | undefined>
	set: <K extends keyof TContext>(key: K, value: TContext[K]) => Promise<void>
	has: <K extends keyof TContext>(key: K) => Promise<boolean>
	delete: <K extends keyof TContext>(key: K) => Promise<boolean>
	toJSON: () => Promise<Record<string, any>>
}
```

### `AsyncContextView` Class

An adapter that provides a consistent, `Promise`-based view of a synchronous `ISyncContext` with full type safety. This is created automatically by the runtime for in-memory execution, so your node logic remains consistent.

## Type Safety Benefits

The strongly-typed context system provides:

- **Compile-time key validation**: `keyof TContext` ensures only valid keys can be accessed
- **Precise return types**: `TContext[K]` provides exact type inference for values
- **IntelliSense support**: Full autocomplete for context keys and their types
- **Runtime error prevention**: Type mismatches caught during development

### Example Usage

```typescript
// Define your workflow's context shape
interface SearchWorkflowContext {
  query: string
  results: SearchResult[]
  final_answer?: string
}

// Create a strongly-typed flow
const flow = createFlow<SearchWorkflowContext>('search-flow')

// In your node functions, get full type safety
flow.node('search', async (ctx) => {
  // ✅ Autocomplete suggests: 'query', 'results', 'final_answer'
  const query = await ctx.context.get('query')

  // ✅ Type inference: query is 'string | undefined'
  if (!query) return { action: 'fail' }

  const results = await searchWeb(query)

  // ✅ Type checking: results must match SearchResult[]
  await ctx.context.set('results', results)

  // ❌ Compile-time error: 'invalid_key' not in SearchWorkflowContext
  await ctx.context.get('invalid_key')
})
```

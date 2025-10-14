# API: Context

The context is the state management system for a workflow execution. Flowcraft provides interfaces for both synchronous (in-memory) and asynchronous (distributed) state.

## `ISyncContext` Interface

The synchronous context interface for high-performance, in-memory state.

```typescript
interface ISyncContext<TContext> {
	readonly type: 'sync'
	get: (key) => TContext[K] | undefined
	set: (key, value) => void
	has: (key) => boolean
	delete: (key) => boolean
	toJSON: () => Record<string, any>
}
```

### `Context` Class

The default, high-performance, in-memory implementation of `ISyncContext`, backed by a `Map`.

-   **`new Context(initialData?)`**: Creates a new context, optionally seeding it with initial data.

## `IAsyncContext` Interface

The asynchronous context interface for remote or distributed state. Node logic always interacts with this interface.

```typescript
interface IAsyncContext<TContext> {
	readonly type: 'async'
	get: (key) => Promise<TContext[K] | undefined>
	set: (key, value) => Promise<void>
	has: (key) => Promise<boolean>
	delete: (key) => Promise<boolean>
	toJSON: () => Promise<Record<string, any>>
}
```

### `AsyncContextView` Class

An adapter that provides a consistent, `Promise`-based view of a synchronous `ISyncContext`. This is created automatically by the runtime for in-memory execution, so your node logic remains consistent.

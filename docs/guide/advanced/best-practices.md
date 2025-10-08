# Best Practices

This guide covers a set of recommended patterns and practices for building maintainable, robust, and scalable workflows with Flowcraft.

## State Management

Effective state management in the `Context` is crucial for building clean workflows.

### 1. Use `ContextKey` for Type Safety (In-Memory)

Always prefer `contextKey()` over raw strings for in-memory workflows. This provides compile-time safety against typos and type mismatches.

```typescript
// BAD: Prone to typos, returns `any`
const userId = await ctx.get('user_id')

// GOOD: Type-safe, autocompletes, checked by the compiler
const USER_ID = contextKey<number>('user_id')
const userId = await ctx.get(USER_ID) // type is `number | undefined`
```
> [!WARNING]
> For distributed workflows built with `GraphBuilder`, you must use serializable `string` keys, as `ContextKey`s (`Symbol`s) cannot be sent over a network.

### 2. Keep the Context Minimal

The `Context` should only contain data that is required by a **subsequent node**. Intermediate data used within a single node should be kept in local variables. A lean context is easier to debug and reason about.

### 3. Use `params` for Static Configuration

-   **Dynamic State** (data that changes during a run) belongs in the **`Context`**.
-   **Static Configuration** (data provided at the start that doesn't change) belongs in **`params`**.

This makes your nodes more reusable and their dependencies more explicit.

```typescript
// GOOD: `amount` is static configuration, passed via params.
class AddAmountNode extends Node {
	async exec({ ctx, params }) {
		const current = await ctx.get(VALUE)
		return current + params.amount
	}
}
const add10 = new AddAmountNode().withParams({ amount: 10 })
```

### 4. Plan for Serialization

If your workflow state needs to be persisted or sent over a network, you cannot store complex data types (`Map`, `Set`, `Date`, class instances) in the context without a proper serialization strategy.

> [!WARNING]
> **Standard `JSON.stringify` is Lossy!**
>
> Standard `JSON.stringify` will not correctly preserve complex data types and can lead to silent data loss or bugs. `Map` and `Set` objects are converted to `{}`, `Date` objects become strings, and custom class instances lose their methods.

> [!TIP]
> Use a library like [`superjson`](https://github.com/blitz-js/superjson) to serialize and deserialize your context. It transparently handles all common JavaScript types, ensuring that the state you save is the same as the state you load. The **[Advanced RAG Agent](https://github.com/gorango/tree/master/sandbox/6.rag/)** sandbox demonstrates this pattern.

## Testing Workflows

Flowcraft's design makes both unit and integration testing straightforward.

### 1. Test `exec` in Isolation

A `Node`'s `exec` method is designed to be a pure function. You can test it directly by instantiating your node and calling `node.exec()` with mocked `NodeArgs`. This allows you to unit test your core business logic without the overhead of a full flow.

```typescript
// MyNode.test.ts
it('should correctly process data', async () => {
	const node = new MyNode()
	const mockArgs = { prepRes: { input: 'test' } } // Mock inputs
	const result = await node.exec(mockArgs)
	expect(result).toBe('PROCESSED TEST')
})
```

### 2. Test the Full Lifecycle with `.run()`

To test a node's interaction with the `Context` (`prep` and `post`), use the `node.run()` method.

1.  Create a `TypedContext` and pre-populate it with the necessary starting state.
2.  Call `await node.run(context)`.
3.  Assert that the `Context` contains the expected final state.

```typescript
// MyNode.test.ts
it('should read from and write to the context', async () => {
	const node = new MyNode()
	const context = new TypedContext([[INPUT, 'test']])

	await node.run(context)

	expect(await context.get(OUTPUT)).toBe('PROCESSED TEST')
})
```

### 3. Test Flows by Asserting Final State

Integration test an entire `Flow` the same way: run the flow and then assert that the `Context` has reached the expected final state. For branching logic, create separate tests for each path, setting up the initial context to force the flow down a specific branch.

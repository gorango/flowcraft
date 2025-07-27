# Middleware

Middleware provides a powerful mechanism to hook into the execution of nodes within a `Flow`. It allows you to wrap the logic of every node, making it the ideal pattern for handling **cross-cutting concerns** without cluttering your business logic.

## What is Middleware?

A middleware is a function that sits between the `Executor` and the `Node` it is about to execute. It receives the node's arguments and a `next` function. The middleware can perform actions before calling `next()` to proceed with the node's execution, and after `next()` returns to process the result.

This is conceptually similar to middleware in web frameworks like Express or Koa.

## Common Use Cases

- **Performance Monitoring**: Start a timer before `next()` and record the duration after it completes to measure how long each node takes.
- **Authentication/Authorization**: Check if the current context has valid credentials before allowing a node to run.
- **Transaction Management**: Start a database transaction before the first node in a flow and commit or roll it back after the flow completes.
- **Input/Output Validation**: Validate a node's parameters before execution or its results after execution.
- **Centralized Logging**: Implement structured logging for every node's entry and exit. See the [Logging Guide](./logging.md) for more on this topic.

## How to Use Middleware

You can add middleware to any `Flow` instance using the `.use()` method. You can add multiple middleware functions; they will be executed in the order they are added.

### The Middleware Function Signature

A middleware function has the following signature:

```typescript
type Middleware = (args: NodeArgs, next: MiddlewareNext) => Promise<any>
type MiddlewareNext = (args: NodeArgs) => Promise<any>
```

- `args`: The `NodeArgs` object, containing the `ctx`, `params`, `logger`, etc., for the node about to be executed.
- `next`: A function that you must call to pass control to the next middleware in the chain, or to the node itself if it's the last one.

### Example: Database Transaction Middleware

A classic use case for middleware is managing a database transaction. We want to start a transaction before the flow runs and either `COMMIT` it on success or `ROLLBACK` on failure.

Let's assume we have a `dbClient` with `beginTransaction`, `commit`, and `rollback` methods.

```typescript
// A mock database client
const dbClient = {
	beginTransaction: async () => console.log('[DB] ==> BEGIN TRANSACTION'),
	commit: async () => console.log('[DB] <== COMMIT'),
	rollback: async () => console.log('[DB] <== ROLLBACK'),
	query: async (sql: string) => console.log(`[DB] Executing: ${sql}`),
}

// Our transaction middleware
async function transactionMiddleware(args, next) {
	// This middleware only acts on the top-level Flow, not individual nodes.
	// We check the node's name to apply the logic selectively.
	if (args.name !== 'TransactionFlow') {
		return next(args)
	}

	await dbClient.beginTransaction()
	try {
		// Call next() to execute the entire wrapped flow
		const result = await next(args)
		await dbClient.commit()
		return result
	}
	catch (error) {
		console.error('[DB] Error occurred, rolling back transaction.')
		await dbClient.rollback()
		// Re-throw the error so the top-level caller knows the flow failed
		throw error
	}
}

// Nodes that simulate database operations
class CreateUserNode extends Node {
	async exec() { await dbClient.query('INSERT INTO users...') }
}
class UpdateProfileNode extends Node {
	async exec() { await dbClient.query('UPDATE profiles...') }
}

// A specific Flow class to attach the middleware to
class TransactionFlow extends Flow {}

// Create a flow with a couple of nodes
const flow = new TransactionFlow(new CreateUserNode())
flow.startNode.next(new UpdateProfileNode())

// Apply the middleware
flow.use(transactionMiddleware)

// Run it
console.log('--- Running successful transaction ---')
await flow.run(new TypedContext())
```

When this runs, the transaction is correctly committed:

```
--- Running successful transaction ---
[DB] ==> BEGIN TRANSACTION
[DB] Executing: INSERT INTO users...
[DB] Executing: UPDATE profiles...
[DB] <== COMMIT
```

If a node were to fail, the `try...catch` block in the middleware would catch the error and issue a `ROLLBACK`, ensuring data integrity. This powerful pattern keeps your business logic nodes (`CreateUserNode`) clean and unaware of transaction management.

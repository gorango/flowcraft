# Execution Control

Flowcraft provides advanced mechanisms to control and influence the execution of your workflows at runtime. This guide covers two key patterns: graceful cancellation for stopping in-flight workflows and middleware for intercepting node execution to handle cross-cutting concerns.

## 1. Graceful Cancellation

For long-running processes, you often need a way to gracefully abort a task that is already in flight. Flowcraft integrates with the standard web `AbortController` and `AbortSignal` APIs to provide robust cancellation support.

### How It Works

When you run a `Flow`, you can pass an `AbortController` instance in the `RunOptions`.

```typescript
const controller = new AbortController()
flow.run(context, { controller })

// Sometime later, from another part of your application...
controller.abort()
```

Calling `controller.abort()` will cause the currently running asynchronous operation inside a node to throw an `AbortError`, which immediately and cleanly halts the entire workflow.

> [!IMPORTANT]
> **Cancellation is Cooperative.** The framework passes the `AbortSignal` to every node, but it's your responsibility to use it. You must design your `exec` logic to listen for the abort event and stop its work.

### Implementing a Cancellable Node

To make a `Node` cancellable, you must pass the `signal` object from the `NodeArgs` into your asynchronous operations. Many modern libraries, like `fetch`, accept an `AbortSignal` directly.

Let's look at an example using Flowcraft's built-in `sleep` utility, which is cancellable.

```typescript
import { AbortError, ConsoleLogger, Flow, Node, sleep, TypedContext } from 'flowcraft'

class LongRunningNode extends Node {
	async exec({ signal, logger }) {
		logger.info('Starting a very long task...')
		try {
			// Pass the signal to our async operation.
			await sleep(5000, signal)
			logger.info('Task finished successfully.')
		}
		catch (e) {
			if (e instanceof AbortError) {
				logger.warn('The long task was aborted!')
			}
			// Re-throw the error to ensure the flow stops.
			throw e
		}
	}
}

const flow = new Flow(new LongRunningNode())
const context = new TypedContext()
const controller = new AbortController()

// Set a timeout to abort the flow after 1 second.
setTimeout(() => {
	console.log('>>> Aborting workflow from the outside!')
	controller.abort()
}, 1000)

try {
	await flow.run(context, { controller, logger: new ConsoleLogger() })
}
catch (e) {
	if (e instanceof AbortError) {
		console.error('Workflow execution was successfully aborted.')
	}
}
```

## 2. Middleware

Middleware provides a powerful mechanism to hook into the execution of every node within a `Flow`. It allows you to wrap the logic of each node, making it the ideal pattern for handling **cross-cutting concerns** like logging, performance monitoring, or transaction management without cluttering your business logic.

### How It Works

A middleware is a function that sits between the `Executor` and the `Node` it is about to execute. It receives the node's arguments and a `next` function. You can add middleware to any `Flow` instance using the `.use()` method.

```typescript
// The middleware function signature
type Middleware = (args: NodeArgs, next: MiddlewareNext) => Promise<any>
```

### Example: Database Transaction Middleware

A classic use case is managing a database transaction. We want to start a transaction before the flow runs and either `COMMIT` it on success or `ROLLBACK` on failure.

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
	if (args.name !== 'TransactionFlow') {
		return next(args)
	}

	await dbClient.beginTransaction()
	try {
		// Call next() to execute the entire wrapped flow.
		const result = await next(args)
		await dbClient.commit()
		return result
	}
	catch (error) {
		console.error('[DB] Error occurred, rolling back transaction.')
		await dbClient.rollback()
		throw error // Re-throw the error.
	}
}

// A specific Flow class to attach the middleware to
class TransactionFlow extends Flow {}

const flow = new TransactionFlow(new Node().exec(async () => dbClient.query('INSERT...')))
flow.use(transactionMiddleware)

await flow.run(new TypedContext())
// [DB] ==> BEGIN TRANSACTION
// [DB] Executing: INSERT...
// [DB] <== COMMIT
```

This powerful pattern keeps your business logic nodes clean and unaware of transaction management.

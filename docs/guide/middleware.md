# Middleware

Middleware allows you to add cross-cutting concerns to your workflows by wrapping the execution of nodes. This is a powerful pattern for implementing logic that isn't part of any single node's business logic, such as:

-   Database transactions
-   Performance monitoring and tracing
-   Custom caching
-   Schema validation for node inputs/outputs

### The `Middleware` Interface

A middleware object can implement one or more of three hooks:

```typescript
interface Middleware {
	// Runs before a node executes.
	beforeNode?: (ctx, nodeId) => void | Promise<void>

	// Runs after a node executes, even if it fails.
	// Receives the result or error.
	afterNode?: (ctx, nodeId, result, error) => void | Promise<void>

	// Wraps the entire node execution. This is the most powerful hook.
	// It MUST call `next()` to proceed with the actual node execution.
	aroundNode?: (ctx, nodeId, next) => Promise<NodeResult>
}
```

You can provide an array of middleware objects to the `FlowRuntime` constructor. They are executed in a "wraparound" or LIFO (Last-In, First-Out) order.

### Example: Transaction Middleware

The most common use case for `aroundNode` is managing database transactions. We want to start a transaction before a node runs, commit it if the node succeeds, or roll it back if it fails.

```typescript
import { Middleware, NodeResult } from 'flowcraft'
// Assume 'db' is your database client instance
import { db } from './database'

const transactionMiddleware: Middleware = {
	aroundNode: async (context, nodeId, next: () => Promise<NodeResult>) => {
		// This code runs BEFORE the node's logic.
		console.log(`[TX] Starting transaction for node: ${nodeId}`)
		await db.query('BEGIN')

		try {
			// `next()` executes the next middleware or the node itself.
			const result = await next()

			// This code runs ONLY if `next()` succeeds.
			console.log(`[TX] Committing transaction for node: ${nodeId}`)
			await db.query('COMMIT')
			return result
		}
		catch (e) {
			// This code runs ONLY if `next()` throws an error.
			console.log(`[TX] Rolling back transaction for node: ${nodeId}`)
			await db.query('ROLLBACK')

			// It's crucial to re-throw the error so the runtime can handle it.
			throw e
		}
	},
}

// Use it in the runtime:
const runtime = new FlowRuntime({
	middleware: [transactionMiddleware],
})
```

### Example: Performance Monitoring

You can use `beforeNode` and `afterNode` for simpler tasks like performance logging.

```typescript
const performanceMiddleware: Middleware = {
	// Store the start time in a WeakMap to avoid polluting the context
	_startTimes: new WeakMap(),

	beforeNode(context, nodeId) {
		this._startTimes.set(context, Date.now())
		console.log(`Executing node ${nodeId}...`)
	},

	afterNode(context, nodeId, result, error) {
		const startTime = this._startTimes.get(context)
		if (startTime) {
			const duration = Date.now() - startTime
			console.log(`Node ${nodeId} finished in ${duration}ms. Status: ${error ? 'failed' : 'success'}`)
		}
	}
}
```
Middleware provides a clean and modular way to enhance your workflows without modifying your core business logic.

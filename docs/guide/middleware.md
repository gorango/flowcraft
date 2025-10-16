# Middleware

Middleware allows you to add cross-cutting concerns to your workflows by wrapping the execution of nodes. This is a powerful pattern for implementing logic that isn't part of any single node's business logic, such as:

-   Database transactions
-   Performance monitoring and tracing
-   Custom caching
-   Schema validation for node inputs/outputs

## The `Middleware` Interface

A [`Middleware`](/api/middleware) object can implement one or more of three hooks:

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

You can provide an array of middleware objects to the [`FlowRuntime`](/api/runtime) constructor. They are executed in a "wraparound" or LIFO (Last-In, First-Out) order.

## Example: Transaction Middleware

The most common use case for [`aroundNode`](api/middleware#aroundnode) is managing database transactions. We want to start a transaction before a node runs, commit it if the node succeeds, or roll it back if it fails.

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

## Example: Performance Monitoring

You can use [`beforeNode`](api/middleware#beforenode) and [`afterNode`](api/middleware#afternode) for simpler tasks like performance logging.

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
## Example: OpenTelemetry Observability

For [distributed](/guide/distributed-execution) tracing and observability, you can use the [`@flowcraft/opentelemetry-middleware`](https://npmjs.com/package/@flowcraft/opentelemetry-middleware) package. This middleware integrates with [OpenTelemetry](https://opentelemetry.io/) to provide end-to-end visibility into workflow executions.

```typescript
import { OpenTelemetryMiddleware } from '@flowcraft/opentelemetry-middleware'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

// Set up OpenTelemetry SDK (standard OTel setup)
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(), // Point to Jaeger, Datadog, etc.
})
sdk.start()

// Create the middleware
const otelMiddleware = new OpenTelemetryMiddleware('flowcraft-worker')

// Add to runtime
const runtime = new FlowRuntime({
  middleware: [otelMiddleware],
})
```

This middleware automatically creates spans for each node execution, propagates context between nodes, and records errors, enabling full observability in distributed environments.

## Advanced Middleware: Modifying Results and Context

The `aroundNode` hook is particularly powerful because it allows you to intercept, modify, or completely replace the `NodeResult` before it's returned to the runtime. Additionally, you can use the `ctx` argument to mutate the workflow's shared state via `ctx.set(...)`. This enables advanced use cases like custom caching, result enrichment, or dynamic context manipulation.

### Modifying NodeResult

In `aroundNode`, after calling `next()`, you receive the original `NodeResult`. You can modify its properties (e.g., `data`, `error`, or custom fields) or return an entirely new `NodeResult`. This is useful for tasks like adding metadata, filtering sensitive data, or implementing custom error handling.

```typescript
import { Middleware, NodeResult } from 'flowcraft'

const resultEnrichmentMiddleware: Middleware = {
  aroundNode: async (ctx, nodeId, next) => {
    const result = await next()

    // Modify the result by adding custom metadata
    if (result.data) {
      result.data = {
        ...result.data,
        enrichedAt: new Date().toISOString(),
        nodeId: nodeId,
        // Add any other custom fields
      }
    }

    // Alternatively, return a completely new NodeResult
    // For example, to mask errors in production:
    if (result.error && process.env.NODE_ENV === 'production') {
      return new NodeResult({
        data: null,
        error: new Error('An internal error occurred'), // Generic error
      })
    }

    return result
  },
}
```

### Mutating Workflow Context

The `ctx` object provides access to the workflow's shared state. You can read from it using `ctx.get(key)` and write to it using `ctx.set(key, value)`. This allows middleware to pass data between nodes or influence the workflow's behavior dynamically.

```typescript
const contextMutationMiddleware: Middleware = {
  aroundNode: async (ctx, nodeId, next) => {
    // Read existing context values
    const previousCount = ctx.get('executionCount') || 0

    // Mutate the context before node execution
    ctx.set('executionCount', previousCount + 1)
    ctx.set('lastNodeId', nodeId)

    // You can also store node-specific data for later use
    const startTime = Date.now()
    ctx.set(`startTime_${nodeId}`, startTime)

    const result = await next()

    // Update context after node execution
    const endTime = Date.now()
    ctx.set(`endTime_${nodeId}`, endTime)
    ctx.set(`duration_${nodeId}`, endTime - startTime)

    return result
  },
}
```

These capabilities make `aroundNode` ideal for implementing features like:

- **Custom Caching:** Check `ctx.get('cache')` before calling `next()`, and store results in the context for future nodes.
- **Dynamic Configuration:** Modify node behavior based on context values set by previous middleware or nodes.
- **Result Transformation:** Enrich or filter `NodeResult` data before it's processed further.

Middleware provides a clean and modular way to enhance your workflows without modifying your core business logic.

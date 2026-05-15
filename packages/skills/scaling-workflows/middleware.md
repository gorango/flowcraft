# Middleware and Observability

## Middleware pipeline

Hook into node execution lifecycle:

```typescript
import type { Middleware } from 'flowcraft'

const loggingMiddleware: Middleware = {
	async beforeNode(ctx) {
		console.log(`[START] ${ctx.nodeId}`)
	},
	async afterNode(ctx, result) {
		console.log(`[DONE] ${ctx.nodeId}: ${result.output}`)
	},
	async aroundNode(ctx, next) {
		const start = Date.now()
		try {
			const result = await next()
			console.log(`[OK] ${ctx.nodeId} (${Date.now() - start}ms)`)
			return result
		} catch (error) {
			console.error(`[FAIL] ${ctx.nodeId} (${Date.now() - start}ms)`)
			throw error
		}
	},
}

const runtime = new FlowRuntime({ middleware: [loggingMiddleware] })
```

**Lifecycle order:**

1. `beforeNode` hooks execute in registration order
2. `aroundNode` hooks wrap execution (reverse order, like onion layers)
3. Node executes: `prep()` → `exec()` → `post()`
4. `afterNode` hooks execute in registration order

**AroundNode execution flow:**

```
middleware1.aroundNode
  └─ middleware2.aroundNode
       └─ middleware3.aroundNode
            └─ node.exec()
```

## Middleware context

Each middleware hook receives an execution context:

```typescript
interface MiddlewareContext {
	nodeId: string
	blueprintId: string
	executionId: string
	nodeDefinition: NodeDefinition
	context: IAsyncContext
	signal?: AbortSignal
}
```

## Common middleware patterns

### Timing middleware

```typescript
function timingMiddleware(): Middleware {
	return {
		async aroundNode(ctx, next) {
			const start = performance.now()
			const result = await next()
			const duration = performance.now() - start
			console.log(`${ctx.nodeId}: ${duration.toFixed(2)}ms`)
			return result
		},
	}
}
```

### Error handling middleware

```typescript
function errorHandlingMiddleware(): Middleware {
	return {
		async afterNode(ctx, result) {
			if (result.error) {
				await reportError({
					nodeId: ctx.nodeId,
					error: result.error,
					executionId: ctx.executionId,
				})
			}
		},
	}
}
```

### Rate limiting middleware

```typescript
function rateLimitMiddleware(maxPerSecond: number): Middleware {
	const timestamps: number[] = []

	return {
		async beforeNode(ctx) {
			const now = Date.now()
			timestamps.push(now)

			// Remove timestamps older than 1 second
			while (timestamps.length > 0 && timestamps[0] < now - 1000) {
				timestamps.shift()
			}

			if (timestamps.length > maxPerSecond) {
				await sleep(1000 / maxPerSecond)
			}
		},
	}
}
```

### Retry logging middleware

```typescript
function retryLoggingMiddleware(): Middleware {
	return {
		async aroundNode(ctx, next) {
			let attempt = 0
			const retry = async () => {
				attempt++
				try {
					return await next()
				} catch (error) {
					console.log(`${ctx.nodeId} attempt ${attempt} failed: ${error.message}`)
					throw error
				}
			}
			return retry()
		},
	}
}
```

## OpenTelemetry integration

```typescript
import { OpenTelemetryMiddleware } from '@flowcraft/middleware-opentelemetry'

const runtime = new FlowRuntime({
	middleware: [OpenTelemetryMiddleware()],
})
```

Provides:

- Distributed tracing across workflow nodes
- Span creation for each node execution
- Error tracking in spans
- Duration metrics

## Event bus

All runtime events flow through `IEventBus`:

```typescript
import type { IEventBus, FlowcraftEvent } from 'flowcraft'

class CustomEventBus implements IEventBus {
	emit(event: FlowcraftEvent) {
		// Forward to your observability platform
		// e.g., send to Datadog, CloudWatch, etc.
	}
}

const runtime = new FlowRuntime({ eventBus: new CustomEventBus() })
```

### Key event types

**Workflow lifecycle:**

- `workflow:start` — Execution begins
- `workflow:finish` — Execution completes
- `workflow:stall` — Cannot proceed
- `workflow:pause` — Paused at wait node
- `workflow:resume` — Resumed from pause

**Node lifecycle:**

- `node:start` — Node execution begins
- `node:finish` — Node completed successfully
- `node:error` — Node failed
- `node:retry` — Node retry attempt
- `node:fallback` — Fallback executed
- `node:skipped` — Node skipped

**Data flow:**

- `context:change` — Context value modified
- `edge:evaluate` — Edge condition evaluated

**Batch operations:**

- `batch:start` — Batch processing begins
- `batch:finish` — Batch processing completes

**Distributed execution:**

- `job:enqueued` — Job sent to queue
- `job:processed` — Job completed
- `job:failed` — Job failed

## Combining middleware and events

```typescript
const eventLogger = new InMemoryEventLogger()
const runtime = new FlowRuntime({
	eventBus: eventLogger,
	middleware: [timingMiddleware(), errorHandlingMiddleware(), OpenTelemetryMiddleware()],
})

const result = await runtime.run(blueprint, {})

// Both middleware ran AND events were captured
const nodeTimings = eventLogger
	.getEvents('node:finish')
	.map((e) => ({ nodeId: e.nodeId, timestamp: e.timestamp }))
```

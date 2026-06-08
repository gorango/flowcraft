---
name: scaling-workflows
description: Scale Flowcraft workflows from in-memory to distributed execution using adapters (BullMQ, SQS, RabbitMQ, GCP, Azure, Kafka, Cloudflare). Covers durable primitives, middleware, and observability. Use when deploying workflows to production, configuring distributed execution, setting up message queues, adding middleware, or enabling observability.
---

# Scaling Workflows

Flowcraft workflows scale from in-memory to distributed systems without changing core business logic. Adapters abstract the queue technology.

## Architecture

```
In-Memory (development)          Distributed (production)
  FlowRuntime                      FlowRuntime + Adapter
  Direct execute                   Queue-based execute
  Single process                   Multi-worker/process
```

## Distributed adapters

All adapters extend `BaseDistributedAdapter` and implement:

- `createContext()` — initialize coordination state
- `processJobs()` — handle incoming node executions
- `enqueueJob()` — dispatch nodes to workers
- `publishFinalResult()` — emit workflow completion

### Available adapters

| Adapter    | Queue Technology   | See                                          |
| ---------- | ------------------ | -------------------------------------------- |
| BullMQ     | Redis              | [adapters/bullmq.md](adapters/bullmq.md)     |
| SQS        | AWS SQS            | [adapters/sqs.md](adapters/sqs.md)           |
| RabbitMQ   | RabbitMQ/AMQP      | [adapters/rabbitmq.md](adapters/rabbitmq.md) |
| GCP        | Google Cloud Tasks | [adapters/cloud.md](adapters/cloud.md)       |
| Azure      | Azure Service Bus  | [adapters/cloud.md](adapters/cloud.md)       |
| Kafka      | Apache Kafka       | [adapters/cloud.md](adapters/cloud.md)       |
| Cloudflare | Cloudflare Queues  | [adapters/cloud.md](adapters/cloud.md)       |
| Vercel     | Vercel Queues      | [adapters/cloud.md](adapters/cloud.md)       |

### Adapter setup pattern

```typescript
import { FlowRuntime } from 'flowcraft'
import { BullMQAdapter } from '@flowcraft/adapter-bullmq'

const adapter = new BullMQAdapter({
	connection: { host: 'localhost', port: 6379 },
	prefix: 'flowcraft',
})

const runtime = new FlowRuntime()
const result = await adapter.run(blueprint, initialState, {
	functionRegistry,
	maxConcurrency: 10,
})
```

## Durable primitives

### SleepNode — durable timers

```typescript
.flow.sleep('delay', { duration: 5000 })
```

Use `runtime.startScheduler()` to auto-resume.

### WaitNode — human-in-the-loop

```typescript
.flow.wait('approval')
```

Resume with: `await runtime.resume(blueprint, serializedContext, resumeData)`

### WebhookNode — external triggers

```typescript
.flow.node('webhook', {
  uses: 'webhook',
  params: { path: '/hooks/payment', secret: 'wh_secret' },
})
```

### SubflowNode — nested workflows

```typescript
.flow.node('sub', {
  uses: 'subflow',
  params: { blueprintId: 'child-workflow' },
  inputs: { data: 'parent-node' },
})
```

## Middleware pipeline

```typescript
const middleware: Middleware[] = [
	{
		async beforeNode(ctx) {
			console.log(`Starting ${ctx.nodeId}`)
		},
		async afterNode(ctx, result) {
			console.log(`Finished ${ctx.nodeId}`)
		},
		async aroundNode(ctx, next) {
			const start = Date.now()
			const result = await next()
			console.log(`${ctx.nodeId} took ${Date.now() - start}ms`)
			return result
		},
	},
]

const runtime = new FlowRuntime({ middleware })
```

**Lifecycle order:**

1. `beforeNode` hooks (in order)
2. `aroundNode` hooks (wrap in reverse order)
3. Node execution (prep → exec → post)
4. `afterNode` hooks (in order)

## Observability

### OpenTelemetry

```typescript
import { OpenTelemetryMiddleware } from '@flowcraft/middleware-opentelemetry'

const runtime = new FlowRuntime({
	middleware: [OpenTelemetryMiddleware()],
})
```

### Event bus

Key event types: `workflow:start/finish/stall/pause/resume`, `node:start/finish/error/retry`, `context:change`, `batch:start/finish`.

## Coordination patterns

### Delta-based persistence

`TrackedAsyncContext` records only mutations, reducing payload by 80-95%.

### Poison pill pattern

Failed nodes write cancellation pills to prevent stalling successors.

### Fan-in joins

`joinStrategy: 'all'` (wait for all) or `'any'` (first-come-wins with locking).

## Advanced topics

- **Adapter configuration details**: See adapter reference files linked above
- **Durable primitive patterns**: See [primitives.md](primitives.md)
- **Custom middleware**: See [middleware.md](middleware.md)

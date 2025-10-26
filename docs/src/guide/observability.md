# Observability and Events

## Event Bus

Flowcraft provides an event bus for observability, allowing you to monitor workflow execution in real-time. The runtime emits various events during execution, which can be used for logging, monitoring, or triggering external actions.

### Available Events

The event bus uses structured events for observability. See the [`FlowcraftEvent`](/api/runtime#flowcraftevent-type) type definition and detailed descriptions of all available events.

### Event Descriptions

- **`workflow:start`**: Emitted when a workflow execution begins.
- **`workflow:finish`**: Emitted when a workflow completes, fails, or is cancelled.
- **`workflow:stall`**: Emitted when a workflow cannot proceed (e.g., due to unresolved dependencies).
- **`workflow:pause`**: Emitted when a workflow is paused (e.g., due to cancellation or stalling).
- **`workflow:resume`**: Emitted when a workflow resumes execution.
- **`node:start`**: Emitted when a node begins execution, including the resolved input.
- **`node:finish`**: Emitted when a node completes successfully.
- **`node:error`**: Emitted when a node fails.
- **`node:fallback`**: Emitted when a fallback node is executed.
- **`node:retry`**: Emitted when a node execution is retried.
- **`node:skipped`**: Emitted when a conditional edge is not taken.
- **`edge:evaluate`**: Emitted when an edge condition is evaluated, showing the condition and result.
- **`context:change`**: Emitted when data is written to the workflow context.
- **`batch:start`**: Emitted when a batch operation begins.
- **`batch:finish`**: Emitted when a batch operation completes.

### Using the Event Bus

You can provide a custom event bus when creating the runtime:

```typescript
import type { IEventBus } from 'flowcraft'

const eventBus: IEventBus = {
  async emit(event) {
    console.log(`Event: ${event.type}`, event.payload)
    // Send to monitoring service, etc.
  }
}

const runtime = new FlowRuntime({
  registry: myNodeRegistry,
  eventBus,
})
```

For the complete `FlowcraftEvent` type definition, see the [Runtime API documentation](/api/runtime#event-bus).

This allows you to integrate with tools like OpenTelemetry, DataDog, or custom logging systems for comprehensive observability.

## `InMemoryEventLogger`

The `InMemoryEventLogger` acts as a "flight recorder" for debugging complex workflow executions. It captures all events emitted during a workflow run, allowing you to inspect the sequence of operations, data flow, and errors in detail.

### Usage

```typescript
import { createFlow, FlowRuntime } from 'flowcraft'
import { InMemoryEventLogger } from 'flowcraft/testing'

const eventLogger = new InMemoryEventLogger()
const runtime = new FlowRuntime({
	eventBus: eventLogger
})

const flow = createFlow('my-workflow')
	.node('a', () => ({ output: 'done' }))

await runtime.run(flow.toBlueprint())

// You can now inspect the captured events
const startEvent = eventLogger.find('workflow:start')
```

### Benefits

- **Non-Intrusive**: Captures events without modifying workflow logic.
- **Detailed Trace**: Records node executions, context changes, and errors.
- **In-Memory**: Fast and lightweight, ideal for unit tests or local debugging.

## OpenTelemetry

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


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
- **`job:enqueued`**: Emitted when a job is enqueued for distributed processing.
- **`job:processed`**: Emitted when a distributed job completes successfully.
- **`job:failed`**: Emitted when a distributed job fails.

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

## Workflow Replay

Workflow replay enables **time-travel debugging** by reconstructing workflow state from recorded events without re-executing node logic. This is invaluable for debugging failed workflows, analyzing performance issues, or understanding complex state transitions.

### How It Works

When workflows run with persistent event storage, all execution events are captured. The replay system processes these events in order to reconstruct the final workflow state:

- **`node:finish`**: Applies completed node outputs to context
- **`context:change`**: Applies context modifications (including user `context.set()` calls)
- **`node:error`**: Records errors in the workflow state
- **`workflow:finish`**: Marks workflow completion

### Usage

```typescript
import { createFlow, FlowRuntime } from 'flowcraft'
import { PersistentEventBusAdapter, InMemoryEventStore } from 'flowcraft'

// Set up persistent event storage
const eventStore = new InMemoryEventStore()
const eventBus = new PersistentEventBusAdapter(eventStore)
const runtime = new FlowRuntime({ eventBus })

// Create and run a workflow
const flow = createFlow('my-workflow')
	.node('process-data', async ({ context }) => {
		await context.set('result', 'processed')
		return { output: 'done' }
	})

const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

// Later, replay the execution for debugging
const executionId = result.context._executionId
const events = await eventStore.retrieve(executionId)
const replayResult = await runtime.replay(flow.toBlueprint(), events)

// replayResult.context contains the reconstructed final state
console.log(replayResult.context.result) // 'processed'
```

### Benefits

- **Time-Travel Debugging**: Inspect the exact state of any workflow execution at any point
- **Post-Mortem Analysis**: Reconstruct failed workflow states without re-running expensive operations
- **Performance Analysis**: Analyze execution patterns without the overhead of re-execution
- **Testing**: Verify complex state transitions and edge cases
- **Pluggable Storage**: Easy to implement custom event stores (databases, message queues, etc.)

### Event Storage Backends

The replay system is designed to work with any event storage backend. Flowcraft provides:

- **`InMemoryEventStore`**: Simple in-memory implementation for testing and development
- **Custom Implementations**: Implement the `IEventStore` interface for databases, log streams, or message queues

```typescript
interface IEventStore {
  store(event: FlowcraftEvent, executionId: string): Promise<void>
  retrieve(executionId: string): Promise<FlowcraftEvent[]>
  retrieveMultiple(executionIds: string[]): Promise<Map<string, FlowcraftEvent[]>>
}
```

## History Adapters

For persistent event storage in production environments, Flowcraft provides dedicated history adapter packages that implement the `IEventStore` interface for different databases.

### SQLite History Adapter

The `@flowcraft/sqlite-history` package provides SQLite-based event storage, ideal for development, testing, and small-scale production deployments.

```typescript
import { PersistentEventBusAdapter } from 'flowcraft'
import { SQLiteEventStore } from '@flowcraft/sqlite-history'

const eventStore = new SQLiteEventStore({
  databasePath: './workflow-events.db'
})
const eventBus = new PersistentEventBusAdapter(eventStore)
const runtime = new FlowRuntime({ eventBus })
```

### PostgreSQL History Adapter

The `@flowcraft/postgres-history` package provides PostgreSQL-based event storage for enterprise-scale deployments requiring high availability and performance.

```typescript
import { PersistentEventBusAdapter } from 'flowcraft'
import { PostgresEventStore } from '@flowcraft/postgres-history'

const eventStore = new PostgresEventStore({
  connectionString: process.env.DATABASE_URL,
  tableName: 'workflow_events' // optional, defaults to 'flowcraft_events'
})
const eventBus = new PersistentEventBusAdapter(eventStore)
const runtime = new FlowRuntime({ eventBus })
```

Both adapters automatically create the necessary database schema on first use and support efficient querying by execution ID.

## CLI Tool

The `@flowcraft/cli` package provides a command-line interface for inspecting workflow executions stored in history adapters.

### Installation

```bash
npm install -g @flowcraft/cli
# or
pnpm add -g @flowcraft/cli
```

### Usage

```bash
flowcraft inspect <run-id> [options]
```

### Configuration

The CLI supports multiple configuration methods:

1. **Command-line arguments**:
   ```bash
   flowcraft inspect run_abc123 --store sqlite --database-path ./events.db
   ```

2. **Environment variables**:
   ```bash
   FLOWCRAFT_STORE=sqlite FLOWCRAFT_DATABASE_PATH=./events.db flowcraft inspect run_abc123
   ```

3. **Configuration file** (`.flowcraftrc.json` or `flowcraft.config.json`):
   ```json
   {
     "store": "sqlite",
     "databasePath": "./events.db"
   }
   ```

### Supported Stores

- **SQLite**: `--store sqlite --database-path <path>`
- **PostgreSQL**: `--store postgres --connection-string <url>`

### Output Formats

- **Human-readable** (default): Formatted output with colors and structure
- **JSON**: `--json` flag for machine-readable output

### Example

```bash
# Inspect a run with SQLite storage
flowcraft inspect run_abc123 --store sqlite --database-path ./workflow-events.db

# Inspect with PostgreSQL and JSON output
flowcraft inspect run_xyz789 --store postgres --connection-string $DATABASE_URL --json
```

The CLI reconstructs the complete workflow execution state from stored events, providing detailed information about node executions, context changes, and any errors that occurred.

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


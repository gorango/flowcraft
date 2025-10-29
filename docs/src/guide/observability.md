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

#### Installation

```bash
npm install @flowcraft/sqlite-history
```

#### Usage

```typescript
import { SqliteHistoryAdapter } from '@flowcraft/sqlite-history'
import { PersistentEventBusAdapter } from 'flowcraft'

// Create SQLite event store
const eventStore = new SqliteHistoryAdapter({
  databasePath: './workflow-events.db',
  walMode: true, // Enable WAL mode for better concurrent access
})

// Create persistent event bus
const eventBus = new PersistentEventBusAdapter(eventStore)

// Use with Flowcraft runtime
const runtime = new FlowRuntime({ eventBus })

// Events are automatically stored and can be retrieved later
const events = await eventStore.retrieve(executionId)
```

#### Configuration

- `databasePath`: Path to SQLite database file. Use `:memory:` for in-memory storage.
- `walMode`: Enable WAL mode for better concurrent read/write access (default: true).

#### Features

- **Efficient Storage**: SQLite provides fast, reliable event storage
- **Concurrent Access**: WAL mode enables concurrent reads and writes
- **Query Capabilities**: Retrieve events by execution ID or multiple executions
- **Statistics**: Get insights into stored events and executions

### PostgreSQL History Adapter

The `@flowcraft/postgres-history` package provides PostgreSQL-based event storage for enterprise-scale deployments requiring high availability and performance.

#### Installation

```bash
npm install @flowcraft/postgres-history
```

#### Usage

```typescript
import { PostgresHistoryAdapter } from '@flowcraft/postgres-history'
import { PersistentEventBusAdapter } from 'flowcraft'

// Create PostgreSQL event store
const eventStore = new PostgresHistoryAdapter({
  host: 'localhost',
  port: 5432,
  database: 'flowcraft',
  user: 'flowcraft',
  password: 'password',
  tableName: 'workflow_events', // optional, defaults to 'flowcraft_events'
})

// Create persistent event bus
const eventBus = new PersistentEventBusAdapter(eventStore)

// Use with Flowcraft runtime
const runtime = new FlowRuntime({ eventBus })

// Events are automatically stored and can be retrieved later
const events = await eventStore.retrieve(executionId)
```

#### Configuration

All standard `pg.PoolConfig` options are supported:

- `host`, `port`, `database`, `user`, `password`: Database connection details
- `tableName`: Custom table name (default: 'flowcraft_events')
- `autoCreateTables`: Automatically create tables and indexes (default: true)

#### Features

- **Scalable Storage**: PostgreSQL handles high-volume event storage
- **Concurrent Access**: Full support for concurrent reads and writes
- **Advanced Querying**: Leverage PostgreSQL's JSONB for complex event queries
- **Connection Pooling**: Efficient connection management with pg.Pool
- **Statistics**: Get insights into stored events and executions

Both adapters automatically create the necessary database schema on first use and support efficient querying by execution ID.

## CLI Tool

The `@flowcraft/cli` package provides a command-line interface for workflow observability and debugging.

### Installation

```bash
npm install -g @flowcraft/cli
```

### Inspect Workflow Executions

Inspect a completed workflow execution to see its timeline, node executions, and final state:

```bash
# Inspect using SQLite history
flowcraft inspect <run-id> --database ./workflow-events.db

# Inspect using PostgreSQL history
flowcraft inspect <run-id> \
  --host localhost \
  --port 5432 \
  --user flowcraft \
  --password password \
  --dbname flowcraft

# Output in JSON format
flowcraft inspect <run-id> --database ./events.db --json
```

### Example Output

```
🚀 Workflow Execution Summary
──────────────────────────────────────────────────
Run ID: run_abc123
Blueprint: order-processing-workflow
Status: Completed

📊 Execution Statistics
──────────────────────────────
Total Events: 24
Nodes Started: 5
Nodes Completed: 5
Nodes Failed: 0

⏱️  Node Execution Timeline
────────────────────────────────────────
┌─────────────┬───────────┬──────────┐
│ Node ID     │ Status    │ Duration │
├─────────────┼───────────┼──────────┤
│ validate    │ Completed │ ~        │
│ process     │ Completed │ ~        │
│ ship        │ Completed │ ~        │
│ notify      │ Completed │ ~        │
│ complete    │ Completed │ ~        │
└─────────────┴───────────┴──────────┘

📋 Final Context
────────────────────
orderId: ORD-2024-001
status: shipped
trackingNumber: 1Z999AA1234567890
customerEmail: customer@example.com
```

### Commands

#### `flowcraft inspect <run-id>`

Inspect a workflow execution and display detailed information including:

- **Execution Summary**: Run ID, blueprint, status, and error counts
- **Statistics**: Total events, node execution counts
- **Node Timeline**: Execution status and timing for each node
- **Final Context**: Key-value pairs from the workflow's final state

##### Options

- `--database <path>`: Path to SQLite database file
- `--host <host>`: PostgreSQL host
- `--port <port>`: PostgreSQL port (default: 5432)
- `--user <user>`: PostgreSQL username
- `--password <password>`: PostgreSQL password
- `--dbname <dbname>`: PostgreSQL database name
- `--table <table>`: History table name (default: 'flowcraft_events')
- `--json`: Output raw event data in JSON format

### Configuration

The CLI connects to your history backend to retrieve workflow events. You can configure the connection in several ways (in order of precedence):

#### 1. Command Line Options

##### SQLite Backend
```bash
flowcraft inspect <run-id> --database ./workflow-events.db
```

##### PostgreSQL Backend
```bash
flowcraft inspect <run-id> \
  --host localhost \
  --port 5432 \
  --user flowcraft \
  --password password \
  --dbname flowcraft \
  --table workflow_events
```

#### 2. Environment Variables

##### SQLite
```bash
export FLOWCRAFT_HISTORY_TYPE=sqlite
export FLOWCRAFT_SQLITE_PATH=./workflow-events.db
```

##### PostgreSQL
```bash
export FLOWCRAFT_HISTORY_TYPE=postgres
export FLOWCRAFT_POSTGRES_HOST=localhost
export FLOWCRAFT_POSTGRES_PORT=5432
export FLOWCRAFT_POSTGRES_USER=flowcraft
export FLOWCRAFT_POSTGRES_PASSWORD=password
export FLOWCRAFT_POSTGRES_DB=flowcraft
export FLOWCRAFT_POSTGRES_TABLE=workflow_events  # optional
```

#### 3. Configuration File

Create a `.flowcraft.json` file in your project directory or `~/.flowcraft/config.json`:

##### SQLite Configuration
```json
{
  "history": {
    "type": "sqlite",
    "sqlite": {
      "databasePath": "./workflow-events.db"
    }
  }
}
```

##### PostgreSQL Configuration
```json
{
  "history": {
    "type": "postgres",
    "postgres": {
      "host": "localhost",
      "port": 5432,
      "user": "flowcraft",
      "password": "password",
      "database": "flowcraft",
      "tableName": "workflow_events"
    }
  }
}
```

### Roadmap

- `flowcraft list`: List recent workflow executions
- `flowcraft reconcile <run-id>`: Manually trigger reconciliation for stuck workflows
- `flowcraft inspect --web`: Launch web UI for richer visualization
- `flowcraft compare <run-id-1> <run-id-2>`: Compare two workflow executions

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


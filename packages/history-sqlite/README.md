# @flowcraft/sqlite-history

SQLite-based event store for Flowcraft workflow observability.

## Installation

```bash
npm install @flowcraft/sqlite-history
```

## Usage

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

## Configuration

- `databasePath`: Path to SQLite database file. Use `:memory:` for in-memory storage.
- `walMode`: Enable WAL mode for better concurrent read/write access (default: true).

## Features

- **Efficient Storage**: SQLite provides fast, reliable event storage
- **Concurrent Access**: WAL mode enables concurrent reads and writes
- **Query Capabilities**: Retrieve events by execution ID or multiple executions
- **Statistics**: Get insights into stored events and executions

## API

### `SqliteHistoryAdapter`

Implements the `IEventStore` interface with the following methods:

- `store(event, executionId)`: Store a single event
- `retrieve(executionId)`: Get all events for an execution
- `retrieveMultiple(executionIds)`: Get events for multiple executions
- `close()`: Close database connection
- `clear()`: Clear all events (for testing)
- `getStats()`: Get database statistics

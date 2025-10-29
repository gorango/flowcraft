# @flowcraft/postgres-history

PostgreSQL-based event store for Flowcraft workflow observability.

## Installation

```bash
npm install @flowcraft/postgres-history
```

## Usage

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

## Configuration

All standard `pg.PoolConfig` options are supported:

- `host`, `port`, `database`, `user`, `password`: Database connection details
- `tableName`: Custom table name (default: 'flowcraft_events')
- `autoCreateTables`: Automatically create tables and indexes (default: true)

## Features

- **Scalable Storage**: PostgreSQL handles high-volume event storage
- **Concurrent Access**: Full support for concurrent reads and writes
- **Advanced Querying**: Leverage PostgreSQL's JSONB for complex event queries
- **Connection Pooling**: Efficient connection management with pg.Pool
- **Statistics**: Get insights into stored events and executions

## API

### `PostgresHistoryAdapter`

Implements the `IEventStore` interface with the following methods:

- `store(event, executionId)`: Store a single event
- `retrieve(executionId)`: Get all events for an execution
- `retrieveMultiple(executionIds)`: Get events for multiple executions
- `close()`: Close database connections
- `clear()`: Clear all events (for testing)
- `getStats()`: Get database statistics
- `getPool()`: Access underlying pg.Pool for advanced usage

## Database Schema

The adapter creates a table with the following structure:

```sql
CREATE TABLE flowcraft_events (
  id SERIAL PRIMARY KEY,
  execution_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_flowcraft_events_execution_id ON flowcraft_events(execution_id);
CREATE INDEX idx_flowcraft_events_event_type ON flowcraft_events(event_type);
CREATE INDEX idx_flowcraft_events_timestamp ON flowcraft_events(timestamp);
```

# Time-Travel Debugging

Flowcraft's time-travel debugging allows you to replay workflow executions from persistent event logs, enabling powerful debugging and analysis capabilities. This feature reconstructs the exact state of any workflow execution without re-running the logic.

## Overview

Time-travel debugging works by storing all workflow events (node starts, finishes, context changes, errors, etc.) in a persistent event store. You can then replay these events to reconstruct the workflow state at any point in time, making it easy to:

- Debug complex workflow failures
- Analyze performance bottlenecks
- Understand execution flow
- Build monitoring and observability tools

## Setting Up Event Storage

Flowcraft provides several event store implementations:

### In-Memory Event Store (Development)

```typescript
import { InMemoryEventStore, PersistentEventBusAdapter } from 'flowcraft'

const eventStore = new InMemoryEventStore()
const eventBus = new PersistentEventBusAdapter(eventStore)
const runtime = new FlowRuntime({ eventBus })
```

### SQLite Event Store

```typescript
import { SqliteHistoryAdapter } from '@flowcraft/sqlite-history'

const eventStore = new SqliteHistoryAdapter({
  databasePath: './workflow-events.db',
  walMode: true // Enable WAL for concurrent access
})
const eventBus = new PersistentEventBusAdapter(eventStore)
const runtime = new FlowRuntime({ eventBus })
```

### PostgreSQL Event Store

```typescript
import { PostgresHistoryAdapter } from '@flowcraft/postgres-history'

const eventStore = new PostgresHistoryAdapter({
  host: 'localhost',
  port: 5432,
  database: 'flowcraft',
  user: 'flowcraft',
  password: 'password',
  tableName: 'workflow_events'
})
const eventBus = new PersistentEventBusAdapter(eventStore)
const runtime = new FlowRuntime({ eventBus })
```

## Recording Workflow Executions

Once configured with a persistent event bus, all workflow executions are automatically recorded:

```typescript
const runtime = new FlowRuntime({ eventBus })

// All executions are now recorded
const result = await runtime.run(blueprint, initialContext, {
  functionRegistry: registry
})
```

Events recorded include:
- `workflow:start` - Workflow execution begins
- `workflow:resume` - Workflow resumes from pause/stall
- `node:start` - Node execution begins
- `node:finish` - Node completes successfully
- `node:error` - Node fails with error
- `node:retry` - Node is retried
- `node:fallback` - Node uses fallback execution
- `context:change` - Context is modified
- `batch:start` - Batch operation begins
- `batch:finish` - Batch operation completes
- `workflow:stall` - Workflow waits (sleep/timer)
- `workflow:pause` - Workflow is paused
- `workflow:finish` - Workflow completes

## Replaying Executions

Replay reconstructs the workflow state from stored events:

```typescript
// Get the execution ID from a previous run
const executionId = result.context._executionId

// Retrieve events for this execution
const events = await eventStore.retrieve(executionId)

// Replay the execution
const replayResult = await runtime.replay(blueprint, events, executionId)

console.log('Replayed result:', replayResult)
```

### Key Replay Behaviors

- **Deterministic**: Replay always produces the same final state
- **Fast**: No node logic is re-executed, only state reconstruction
- **Complete**: All context changes, outputs, and errors are reconstructed
- **Status**: Replayed executions always show `status: 'completed'` (since they reconstruct the final state)

## Advanced Usage

### Replaying Multiple Executions

```typescript
// Get events for multiple executions
const executionIds = ['exec-1', 'exec-2', 'exec-3']
const eventsMap = await eventStore.retrieveMultiple(executionIds)

// Replay each execution
for (const [execId, events] of eventsMap) {
  const replayResult = await runtime.replay(blueprint, events, execId)
  console.log(`Execution ${execId} final state:`, replayResult.context)
}
```

### Analyzing Execution Patterns

```typescript
// Get events and analyze execution patterns
const events = await eventStore.retrieve(executionId)

// Count different event types
const eventCounts = events.reduce((counts, event) => {
  counts[event.type] = (counts[event.type] || 0) + 1
  return counts
}, {} as Record<string, number>)

console.log('Event breakdown:', eventCounts)
```

### Building Custom Analytics

```typescript
// Extract timing information
const nodeTimings = events
  .filter(e => e.type === 'node:start' || e.type === 'node:finish')
  .reduce((timings, event) => {
    const nodeId = event.payload.nodeId
    if (event.type === 'node:start') {
      timings[nodeId] = { start: event.timestamp }
    } else if (timings[nodeId]) {
      timings[nodeId].end = event.timestamp
      timings[nodeId].duration = event.timestamp - timings[nodeId].start
    }
    return timings
  }, {} as Record<string, any>)

console.log('Node execution times:', nodeTimings)
```

## Integration with Existing Tools

### Combining with Interactive Debugging

```typescript
import { createStepper } from 'flowcraft/testing'

// Use stepper for detailed debugging
const stepper = await createStepper(runtime, blueprint, registry)

// Step through execution while events are recorded
while (!stepper.isDone()) {
  const result = await stepper.next()
  console.log('Current state:', await stepper.state.getContext().getAll())

  // Events are automatically stored for later replay
}
```

### Visual Execution Analysis

```typescript
import { generateMermaidForRun } from 'flowcraft'

// Generate visual execution trace
const events = await eventStore.retrieve(executionId)
const mermaidDiagram = generateMermaidForRun(blueprint, events)

// Render with Mermaid to see execution path
```

## Event Store Management

### Cleanup and Maintenance

```typescript
// Clear all events (useful for testing)
await eventStore.clear()

// Get statistics
const stats = await eventStore.getStats()
console.log(`Total events: ${stats.totalEvents}, Executions: ${stats.executions}`)
```

### Custom Event Stores

Implement the `IEventStore` interface for custom storage backends:

```typescript
import type { FlowcraftEvent, IEventStore } from 'flowcraft'

class CustomEventStore implements IEventStore {
  async store(event: FlowcraftEvent, executionId: string): Promise<void> {
    // Implement storage logic
  }

  async retrieve(executionId: string): Promise<FlowcraftEvent[]> {
    // Implement retrieval logic
    return []
  }

  async retrieveMultiple(executionIds: string[]): Promise<Map<string, FlowcraftEvent[]>> {
    // Implement bulk retrieval
    return new Map()
  }
}
```

## Performance Considerations

- **Storage Size**: Events accumulate over time; implement retention policies
- **Query Performance**: Index execution_id and timestamps for fast retrieval
- **Memory Usage**: Large workflows generate many events; consider pagination
- **Concurrent Access**: Use WAL mode (SQLite) or connection pooling (PostgreSQL)

## Best Practices

1. **Use Appropriate Storage**: In-memory for development, persistent stores for production
2. **Monitor Storage Growth**: Implement event retention and cleanup policies
3. **Index Strategically**: Index on execution_id and event_type for fast queries
4. **Handle Large Workflows**: Consider event pagination for very large executions
5. **Combine with Logging**: Use alongside traditional logging for comprehensive observability

## Troubleshooting

### Common Issues

**Events not being stored**: Ensure `PersistentEventBusAdapter` is properly configured
**Replay state mismatch**: Verify blueprint hasn't changed between recording and replay
**Performance issues**: Check database indexes and consider event archiving
**Memory issues**: Implement event streaming for very large workflows

Time-travel debugging provides unprecedented visibility into workflow execution, making it easier to build reliable and maintainable workflow applications.

# Time-Travel Debugging

Flowcraft supports replaying recorded workflow executions to reconstruct final state without re-executing node logic.

## Architecture

```
Run Phase                          Replay Phase
┌─────────────────────┐           ┌─────────────────────┐
│ FlowRuntime.run()   │           │ FlowRuntime.replay()│
│   ↓                 │           │   ↓                 │
│ Events emitted ────►│  Store    │ Events loaded       │
│                     │──────────►│   ↓                 │
│ PersistentEventBus  │           │ State reconstructed │
│   ↓                 │           │   ↓                 │
│ InMemoryEventStore  │           │ Final context       │
└─────────────────────┘           └─────────────────────┘
```

## Setup

```typescript
import { FlowRuntime, PersistentEventBusAdapter, InMemoryEventStore } from 'flowcraft'

// Set up persistent event storage
const eventStore = new InMemoryEventStore()
const eventBus = new PersistentEventBusAdapter(eventStore)
const runtime = new FlowRuntime({ eventBus })
```

## Recording events

Events are automatically captured when using `PersistentEventBusAdapter`:

```typescript
const result = await runtime.run(blueprint, { userId: '123' })

// Retrieve events for this execution
const executionId = result.context._executionId
const events = await eventStore.retrieve(executionId)
```

## Replaying execution

```typescript
const replayResult = await runtime.replay(blueprint, events)

// Access reconstructed state
console.log(replayResult.context.toJSON())
console.log(replayResult.status) // Always 'completed'
```

## Event types processed during replay

### node:finish

Applies completed node outputs to context:

```typescript
// Event structure
{
  type: 'node:finish',
  nodeId: 'process-order',
  output: { orderId: 'abc123', status: 'processed' },
  // ...
}

// Replay applies: context._outputs['process-order'] = { orderId: 'abc123', ... }
```

### context:change

Applies context modifications recorded during execution:

```typescript
// Event structure
{
  type: 'context:change',
  key: 'result',
  value: { status: 'done' },
  // ...
}

// Replay applies: context.set('result', { status: 'done' })
```

### node:error

Records errors in workflow state:

```typescript
// Event structure
{
  type: 'node:error',
  nodeId: 'api-call',
  error: { message: 'Connection refused', stack: '...' },
  // ...
}
```

### workflow:finish

Marks workflow completion:

```typescript
// Event structure
{
  type: 'workflow:finish',
  status: 'completed',
  // ...
}
```

## Practical use cases

### Post-mortem analysis

```typescript
// After a production incident, retrieve and replay
const events = await eventStore.retrieve(incidentExecutionId)
const replay = await runtime.replay(blueprint, events)

// Inspect what state looked like at each step
console.log('Final context:', replay.context.toJSON())
```

### Comparing expected vs actual

```typescript
// Replay the actual execution
const actual = await runtime.replay(blueprint, actualEvents)

// Run with same inputs to get expected
const expected = await runtime.run(blueprint, initialInputs)

// Compare
expect(actual.context.toJSON()).toEqual(expected.context.toJSON())
```

### Debugging distributed workflows

```typescript
// In distributed mode, events from all workers are collected
const events = await eventStore.retrieve(executionId)

// Replay reconstructs the full picture
const replay = await runtime.replay(blueprint, events)

// Check which nodes executed and in what order
const nodeFinishes = events.filter((e) => e.type === 'node:finish')
console.log(
	'Execution order:',
	nodeFinishes.map((e) => e.nodeId),
)
```

## InMemoryEventStore implementation

For testing and development:

```typescript
import { InMemoryEventStore } from 'flowcraft'

const store = new InMemoryEventStore()
const eventBus = new PersistentEventBusAdapter(store)

// Events are stored in memory
await runtime.run(blueprint, {})

// Retrieve by execution ID
const events = await store.retrieve(executionId)
```

For production, implement `IEventStore` with your preferred backend:

```typescript
interface IEventStore {
	store(executionId: string, event: FlowcraftEvent): Promise<void>
	retrieve(executionId: string): Promise<FlowcraftEvent[]>
}
```

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

## Partial replay from a specific node

For more targeted debugging, replay from a specific node rather than the beginning. This pre-populates ancestor node outputs as initial state and re-executes downstream nodes:

```typescript
// Replay from the failure point with corrected input
const replayResult = await runtime.replayFrom(blueprint, events, 'processNode', {
	inputOverrides: { inputData: correctedData },
	functionRegistry: flow.getFunctionRegistry(),
})

// The replayed workflow runs from 'processNode' onward
// Ancestor outputs (predecessors of 'processNode') are pre-populated
console.log(replayResult.status) // 'completed' or 'failed'
```

This is useful when:

- A workflow fails late and you want to skip re-running early nodes
- You need to test with corrected input at a specific point
- You want to understand how a node behaves with different upstream data

## Rollback execution

Undo context mutations for nodes completed after a target point, reverting execution state:

```typescript
// Rollback to node B, removing C and D's effects from context
const rolledBack = await runtime.rollbackExecution(blueprint, executionId, events, 'B')

// B's output is preserved; C and D are removed
console.log(rolledBack.context['_outputs.B']) // preserved
console.log(rolledBack.context['_outputs.C']) // undefined
```

**Important**: This is a "soft" rollback — it removes `_outputs`, `_inputs`, and errors from context but **cannot undo side effects** (API calls, database writes, file operations) that occurred during node execution.

Throws if the target node has not completed. Uses BFS to find all downstream nodes from the target.

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

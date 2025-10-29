---
"@flowcraft/sqlite-history": minor
"@flowcraft/postgres-history": minor
"flowcraft": minor
---

### Time-Travel Debugging & Workflow Replay

Add comprehensive time-travel debugging capabilities to Flowcraft workflows:

- **PersistentEventBusAdapter**: New adapter for storing all workflow events in configurable backends
- **InMemoryEventStore**: Simple in-memory implementation for testing and development  
- **ReplayOrchestrator**: Replays recorded events to reconstruct workflow state without re-executing nodes
- **FlowRuntime.replay()**: Method to replay a workflow execution from event history
- **History Packages**: New `@flowcraft/sqlite-history` and `@flowcraft/postgres-history` packages for persistent event storage

### Event Types for Replay

The replay system processes these event types:
- `node:finish`: Applies completed node outputs to context
- `context:change`: Applies context modifications (including user `context.set()` calls)  
- `node:error`: Records errors in the workflow state
- `workflow:finish`: Marks workflow completion

Replay always produces a "completed" status since it reconstructs the final state without re-executing logic.

### Usage Example

```typescript
import { FlowRuntime, PersistentEventBusAdapter, InMemoryEventStore } from 'flowcraft'

// Set up persistent event storage
const eventStore = new InMemoryEventStore()
const eventBus = new PersistentEventBusAdapter(eventStore)
const runtime = new FlowRuntime({ eventBus })

// Run a workflow (events are automatically stored)
const result = await runtime.run(blueprint, initialContext)

// Later, replay the execution for debugging
const events = await eventStore.retrieve(result.context._executionId)
const replayResult = await runtime.replay(blueprint, events)

// replayResult.context contains the reconstructed final state
```
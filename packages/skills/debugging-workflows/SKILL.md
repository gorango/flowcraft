---
name: debugging-workflows
description: Test, debug, and troubleshoot Flowcraft workflow executions. Covers test utilities, time-travel debugging, event analysis, and common error patterns. Use when debugging workflows, writing tests, analyzing execution events, replaying workflow runs, or troubleshooting workflow failures.
---

# Debugging Workflows

Flowcraft provides comprehensive debugging tools including event capturing, execution tracing, and time-travel replay.

## Quick start

### Test with trace output

```typescript
import { createFlow, FlowRuntime } from 'flowcraft'
import { runWithTrace } from 'flowcraft/testing'

const flow = createFlow('my-flow')
	.node('step1', async () => ({ output: 'data' }))
	.node('step2', async () => ({ output: 'more' }))
	.edge('step1', 'step2')

const runtime = new FlowRuntime()
const result = await runWithTrace(flow, runtime, { initial: 'data' })
```

### Capture and assert events

```typescript
import { InMemoryEventLogger } from 'flowcraft/testing'

const eventLogger = new InMemoryEventLogger()
const runtime = new FlowRuntime({ eventBus: eventLogger })

const result = await runtime.run(blueprint, {})

const nodeEvents = eventLogger.getEvents('node:finish')
expect(nodeEvents).toHaveLength(3)

const errors = eventLogger.getEvents('node:error')
expect(errors).toHaveLength(0)
```

## Testing patterns

### Event-based assertions

```typescript
import { InMemoryEventLogger } from 'flowcraft/testing'

const eventLogger = new InMemoryEventLogger()
const runtime = new FlowRuntime({ eventBus: eventLogger })

await runtime.run(blueprint, { userId: '123' })

// Verify node execution order
const order = eventLogger.getEvents('node:finish').map((e) => e.nodeId)
expect(order).toEqual(['fetch', 'transform', 'store'])

// Verify context changes
const contextChanges = eventLogger.getEvents('context:change')
expect(contextChanges.some((e) => e.key === 'result')).toBe(true)
```

### Test error handling

```typescript
const failingNode = vi
	.fn()
	.mockRejectedValueOnce(new Error('temp'))
	.mockRejectedValueOnce(new Error('temp'))
	.mockResolvedValue({ output: 'success' })

const flow = createFlow('retry-test').node('flaky', failingNode, { config: { maxRetries: 3 } })

const eventLogger = new InMemoryEventLogger()
const runtime = new FlowRuntime({ eventBus: eventLogger })
await runtime.run(flow.toBlueprint(), {})

expect(failingNode).toHaveBeenCalledTimes(3)
expect(eventLogger.getEvents('node:retry')).toHaveLength(2)
```

## Time-travel debugging

Replay recorded events to reconstruct workflow state without re-executing nodes:

```typescript
import { PersistentEventBusAdapter, InMemoryEventStore } from 'flowcraft'

const eventStore = new InMemoryEventStore()
const eventBus = new PersistentEventBusAdapter(eventStore)
const runtime = new FlowRuntime({ eventBus })

const result = await runtime.run(blueprint, initialContext)

const events = await eventStore.retrieve(result.context._executionId)
const replayResult = await runtime.replay(blueprint, events)
```

### Event types for replay

| Event             | Purpose                                   |
| ----------------- | ----------------------------------------- |
| `node:finish`     | Applies completed node outputs to context |
| `context:change`  | Applies context modifications             |
| `node:error`      | Records errors in workflow state          |
| `workflow:finish` | Marks workflow completion                 |

Replay always produces `completed` status since it reconstructs state without re-execution.

## Troubleshooting

See [common-errors.md](common-errors.md) for detailed troubleshooting of:

- Stalled workflows (unresolved dependencies)
- Missing node implementations in registry
- Cycle detection errors
- Context type mismatches
- Edge condition evaluation failures
- Retry and timeout issues

### Debugging checklist

1. **Check blueprint validity**: Use `lintBlueprint(blueprint)` to catch structural issues
2. **Visualize workflow**: Use `generateMermaid(blueprint)` to verify graph structure
3. **Analyze blueprint**: Use `analyzeBlueprint(blueprint)` for cycle/start/terminal info
4. **Capture events**: Use `InMemoryEventLogger` to trace execution flow
5. **Replay execution**: Use `runtime.replay()` to reconstruct state from events
6. **Check context**: Inspect `result.context` for expected state

## Test coverage

Flowcraft maintains 85%+ line/function coverage thresholds (90%+ for critical files). Run `pnpm test:coverage` locally.

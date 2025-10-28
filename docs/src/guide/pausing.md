# Pausing and Resuming Workflows

This guide provides detailed examples of pausing workflow execution and resuming later, covering both human-in-the-loop interactions and durable timers.

## Overview

Flowcraft workflows can pause execution at specific points and resume later, either automatically (timers) or through external input (human-in-the-loop). This enables:

- **Human-in-the-Loop (HITL)**: Workflows that require human approval or intervention
- **Durable Timers**: Automatic resumption after specified durations
- **Event-Driven Processing**: Waiting for external events or callbacks
- **Scheduled Tasks**: Delaying execution for future processing

## Wait Nodes

Wait nodes pause execution until external input is provided via `runtime.resume()`.

### Simple Approval Workflow

```typescript
import { createFlow, FlowRuntime } from 'flowcraft'

interface ApprovalContext {
  request: { user: string; amount: number }
  approval?: { approved: boolean; reviewer: string }
}

const flow = createFlow<ApprovalContext>('expense-approval')
  .node('submit', async ({ context }) => {
    await context.set('request', { user: 'Alice', amount: 1500 })
    return { output: 'Expense submitted' }
  })
  .wait('manager-approval')
  .node('process', async ({ context }) => {
    const approval = await context.get('approval')
    if (approval?.approved) {
      return { output: 'Expense approved and processed' }
    }
    return { output: 'Expense rejected' }
  })
  .edge('submit', 'manager-approval')
  .edge('manager-approval', 'process')

const runtime = new FlowRuntime()
const blueprint = flow.toBlueprint()

// Initial run - pauses at wait node
const initialResult = await runtime.run(blueprint, {}, {
  functionRegistry: flow.getFunctionRegistry()
})

console.log(initialResult.status) // 'awaiting'

// Resume with approval decision
const finalResult = await runtime.resume(
  blueprint,
  initialResult.serializedContext,
  {
    output: { approved: true, reviewer: 'Bob' },
    action: 'approved'
  },
  'manager-approval'
)

console.log(finalResult.status) // 'completed'
```

### Multiple Concurrent Wait Nodes

```typescript
interface ReviewContext {
  document: string
  reviews: {
    technical?: { approved: boolean; comments: string }
    legal?: { approved: boolean; comments: string }
  }
}

const flow = createFlow<ReviewContext>('parallel-review')
  .node('prepare', async ({ context }) => {
    await context.set('document', 'contract.pdf')
    await context.set('reviews', {})
    return { output: 'Document ready for review' }
  })
  .wait('technical-review')
  .wait('legal-review')
  .node('finalize', async ({ context }) => {
    const reviews = await context.get('reviews')
    const allApproved = reviews?.technical?.approved && reviews?.legal?.approved
    return { output: allApproved ? 'Approved' : 'Rejected' }
  })
  .edge('prepare', 'technical-review')
  .edge('prepare', 'legal-review')
  .edge('technical-review', 'finalize')
  .edge('legal-review', 'finalize')

// Run and resume each wait node separately
const result1 = await runtime.run(blueprint, {}, { functionRegistry })

// Resume technical review
await runtime.resume(blueprint, result1.serializedContext, {
  output: { approved: true, comments: 'Looks good' }
}, 'technical-review')

// Resume legal review
await runtime.resume(blueprint, result1.serializedContext, {
  output: { approved: true, comments: 'Approved' }
}, 'legal-review')
```

## Sleep Nodes

Sleep nodes pause execution for a specified duration and automatically resume.

### Basic Timer

```typescript
const flow = createFlow('delayed-notification')
  .node('schedule', () => ({ output: 'Notification scheduled' }))
  .sleep('delay', { duration: 3600000 }) // 1 hour
  .node('send', () => ({ output: 'Notification sent' }))
  .edge('schedule', 'delay')
  .edge('delay', 'send')

// Workflow automatically completes after 1 hour
const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry })
```

### Retry with Backoff

```typescript
const flow = createFlow('retry-with-backoff')
  .node('attempt', async ({ context }) => {
    const attemptCount = (await context.get('attempts')) || 0
    await context.set('attempts', attemptCount + 1)

    // Simulate API call that might fail
    if (Math.random() < 0.7) { // 70% failure rate
      throw new Error('API temporarily unavailable')
    }

    return { output: 'Success' }
  })
  .sleep('backoff', { duration: 5000 }) // 5 second delay
  .edge('attempt', 'backoff', { action: 'retry' })
  .edge('backoff', 'attempt')
```

## Advanced Patterns

### Conditional Branching with Actions

Use the `action` property in resume data to control which path the workflow takes:

```typescript
const flow = createFlow('conditional-workflow')
  .node('start', () => ({ output: 'Ready for decision' }))
  .wait('decision-point')
  .node('path-a', () => ({ output: 'Executed path A' }))
  .node('path-b', () => ({ output: 'Executed path B' }))
  .node('path-c', () => ({ output: 'Executed path C' }))
  .edge('start', 'decision-point')
  .edge('decision-point', 'path-a', { action: 'choose-a' })
  .edge('decision-point', 'path-b', { action: 'choose-b' })
  .edge('decision-point', 'path-c', { action: 'choose-c' })

// Resume with different actions to take different paths
await runtime.resume(blueprint, serializedContext, {
  output: { reason: 'User preference' },
  action: 'choose-a' // or 'choose-b' or 'choose-c'
})
```

### Combining Sleep and Wait

```typescript
const flow = createFlow('escalation-workflow')
  .node('submit', () => ({ output: 'Ticket submitted' }))
  .wait('initial-response')
  .sleep('escalation-timer', { duration: 86400000 }) // 24 hours
  .node('escalate', () => ({ output: 'Ticket escalated to manager' }))
  .edge('submit', 'initial-response')
  .edge('initial-response', 'escalation-timer', { action: 'pending' })
  .edge('escalation-timer', 'escalate')
```

## State Persistence

Awaiting workflows maintain their state in the serialized context, enabling durability across system restarts:

```typescript
// Store the serialized context (e.g., in database)
const result = await runtime.run(blueprint, initialContext, { functionRegistry })
if (result.status === 'awaiting') {
  await saveToDatabase(result.serializedContext)
}

// Later, resume from stored state
const storedContext = await loadFromDatabase()
const finalResult = await runtime.resume(blueprint, storedContext, resumeData)
```

## Error Handling

Handle errors that occur during paused execution:

```typescript
try {
  const result = await runtime.resume(blueprint, serializedContext, resumeData)
  if (result.errors) {
    console.error('Resume failed:', result.errors)
  }
} catch (error) {
  console.error('Resume error:', error)
}
```

## Best Practices

1. **Check Status**: Always verify `result.status === 'awaiting'` before resuming
2. **Persist State**: Store serialized context for durability
3. **Handle Errors**: Implement proper error handling for resume operations
4. **Use Actions**: Leverage action-based routing for complex workflows
5. **Timeout Management**: Combine sleep nodes with wait nodes for escalation patterns
6. **Concurrent Waits**: Use multiple wait nodes for parallel approvals
7. **State Validation**: Validate resume data before processing
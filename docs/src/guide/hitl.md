# Pausing and Resuming Workflows

This guide covers workflows that can pause execution and resume later, including Human-in-the-Loop (HITL) workflows and durable timers.

## Overview

Flowcraft supports two primary mechanisms for pausing workflow execution:

1. **Wait Nodes**: Pause execution until external input is provided (HITL workflows)
2. **Sleep Nodes**: Pause execution for a specified duration (durable timers)

## Wait Nodes (Human-in-the-Loop)

Wait nodes pause execution until external input is provided, enabling human intervention or external decisions.

### Basic Approval Workflow

```typescript
import { createFlow, FlowRuntime, ConsoleLogger } from 'flowcraft'

const flow = createFlow('approval-workflow')
	.node('start', () => ({ output: { user: 'Alice', amount: 1500 } }))
	.wait('wait-for-approval')
	.node('process', async ({ input }) => {
		if (input?.approved) {
			return { output: 'Approved' }
		}
		return { output: 'Denied' }
	})
	.edge('start', 'wait-for-approval')
	.edge('wait-for-approval', 'process')

const blueprint = flow.toBlueprint()
const functionRegistry = flow.getFunctionRegistry()
const runtime = new FlowRuntime({ logger: new ConsoleLogger() })

// Run until awaiting
const result = await runtime.run(blueprint, {}, { functionRegistry })
if (result.status === 'awaiting') {
	// Resume with input
	const finalResult = await runtime.resume(blueprint, result.serializedContext, { output: { approved: true } }, 'wait-for-approval')
	console.log(finalResult.context)
}
```

<DemoHitl />

### Conditional Branching with Actions

Wait nodes support conditional edges based on the `action` property in resume data:

```typescript
const flow = createFlow('conditional-approval')
	.node('start', () => ({ output: { item: 'document.pdf' } }))
	.wait('review')
	.node('approve', () => ({ output: 'Document approved' }))
	.node('reject', () => ({ output: 'Document rejected' }))
	.node('escalate', () => ({ output: 'Escalated to manager' }))
	.edge('start', 'review')
	.edge('review', 'approve', { action: 'approve' })
	.edge('review', 'reject', { action: 'reject' })
	.edge('review', 'escalate', { action: 'escalate' })

// Resume with different actions
await runtime.resume(blueprint, serializedContext, {
	output: { reviewer: 'john@example.com' },
	action: 'approve' // or 'reject' or 'escalate'
})
```

## Sleep Nodes (Durable Timers)

Sleep nodes pause execution for a specified duration and automatically resume when the timer expires.

### Basic Timer Example

```typescript
const flow = createFlow('delayed-workflow')
	.node('start', () => ({ output: 'Starting delayed task' }))
	.sleep('delay', { duration: 5000 }) // Sleep for 5 seconds
	.node('finish', () => ({ output: 'Task completed after delay' }))
	.edge('start', 'delay')
	.edge('delay', 'finish')

const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry })
// After 5 seconds, workflow automatically completes
```

### Combining Sleep and Wait

```typescript
const flow = createFlow('reminder-workflow')
	.node('start', () => ({ output: { task: 'Review quarterly report' } }))
	.wait('initial-approval')
	.sleep('reminder-delay', { duration: 86400000 }) // 24 hours
	.node('send-reminder', () => ({ output: 'Reminder sent' }))
	.edge('start', 'initial-approval')
	.edge('initial-approval', 'reminder-delay', { action: 'pending' })
	.edge('reminder-delay', 'send-reminder')
```

## Key Concepts

- **Wait Nodes**: Pause execution for external input (HITL workflows)
- **Sleep Nodes**: Pause execution for a duration (durable timers)
- **Resume**: Provide input to continue wait nodes
- **Status**: Check `result.status` for 'awaiting'
- **Actions**: Use `action` property for conditional branching
- **Durability**: Awaiting state persists across system restarts

## Best Practices

- Use wait nodes for human decisions or external API calls
- Use sleep nodes for delays, retries, or scheduled tasks
- Always check `result.status === 'awaiting'` before resuming
- Store serialized context for durability
- Use actions for complex conditional logic

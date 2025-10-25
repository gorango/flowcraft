<script setup>
import AwaitableWorkflowsDemo from '../.vitepress/theme/components/Demo/AwaitableWorkflows.vue'
</script>

# Awaitable Workflows

This guide covers Human-in-the-Loop (HITL) workflows, where execution pauses for external input.

## Overview

Awaitable workflows use `.wait()` nodes to pause execution, allowing for human intervention or external decisions.

## Basic Example

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

<AwaitableWorkflowsDemo />

## Key Concepts

- **Wait Nodes**: Pause execution.
- **Resume**: Provide input to continue.
- **Status**: Check `result.status` for 'awaiting'.

This pattern is useful for approvals, reviews, etc.

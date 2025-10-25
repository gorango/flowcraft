<script setup>
import HitlDemo from '../.vitepress/theme/components/Demo/Hitl.vue'
</script>

# Human-in-the-Loop Workflow

This example demonstrates a workflow that pauses for external input. It showcases:
- Using the `.wait()` method to create a pause point.
- Resuming the workflow with `runtime.resume()`.

## The Goal

Create a workflow that:
1. Starts with initial data.
2. Pauses for human input.
3. Processes the decision based on the input.

<HitlDemo />

## The Code

#### `flow.ts`
```typescript
import { createFlow } from 'flowcraft'

const hitlFlow = createFlow('hitl-workflow')
  .node('start-approval', () => ({ output: { user: 'Alice', amount: 1500 } }))
  .wait('wait-for-approval') // This node pauses execution
  .node('process-decision', async ({ input }) => {
    // The `input` comes from the runtime.resume() call
    if (input?.approved) {
      return { output: 'Request was approved.' }
    }
    return { output: 'Request was denied.', action: 'denied' }
  })
  .edge('start-approval', 'wait-for-approval')
  .edge('wait-for-approval', 'process-decision')
```

#### `main.ts`
```typescript
import { ConsoleLogger, FlowRuntime } from 'flowcraft'
import { hitlFlow } from './flow.js'

async function main() {
  const blueprint = hitlFlow.toBlueprint()
  const functionRegistry = hitlFlow.getFunctionRegistry()

  const runtime = new FlowRuntime({
    logger: new ConsoleLogger(),
  })

  console.log('Starting workflow...')
  const result = await runtime.run(blueprint, {}, { functionRegistry })

  if (result.status === 'awaiting') {
    console.log('Workflow is awaiting input at:', result.context._awaitingNodeIds)

    // Resume with approval
    const resumeResult = await runtime.resume(blueprint, result.serializedContext, { output: { approved: true } }, 'wait-for-approval')

    console.log('Resume result:', resumeResult.context)
  }
}

main()
```

## The Output

```
Starting workflow...
[INFO] Starting workflow execution
[INFO] Workflow execution completed with status: awaiting
Workflow is awaiting input at: ['wait-for-approval']

Resume result: {
  'start-approval': { user: 'Alice', amount: 1500 },
  'wait-for-approval': { approved: true },
  'process-decision': 'Request was approved.'
}
```

This example shows how to pause and resume workflows for human input.

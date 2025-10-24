# Parallel Execution Workflow

This example demonstrates parallel execution of multiple tasks. It showcases:
- Running tasks concurrently for efficiency.
- Gathering results from parallel branches.

## The Goal

Execute multiple tasks in parallel and collect their results.

<script setup>
import ParallelExample from '../.vitepress/theme/examples/ParallelExample.vue'
</script>

<ParallelExample />

## The Code

#### `flow.ts`
```typescript
import { createFlow } from 'flowcraft'

async function mockApiCall(name: string, delay: number, shouldFail = false) {
  console.log(`[${name}] Starting...`)
  await new Promise(resolve => setTimeout(resolve, delay))
  if (shouldFail) {
    console.error(`[${name}] Failing as requested.`)
    throw new Error(`API call "${name}" failed.`)
  }
  const result = { data: `Data from ${name}` }
  console.log(`[${name}] Finished.`)
  return { output: result }
}

const parallelFlow = createFlow('parallel-workflow')
  .node('start-parallel', async () => ({ output: 'start' }))
  .node('task-1', () => mockApiCall('Task 1', 2000))
  .node('task-2', () => mockApiCall('Task 2', 1000))
  .node('task-3', () => mockApiCall('Task 3', 1500))
  .node('gather', async (ctx) => {
    const t1 = await ctx.context.get('_outputs.task-1')
    const t2 = await ctx.context.get('_outputs.task-2')
    const t3 = await ctx.context.get('_outputs.task-3')
    console.log('[Gather] All tasks finished.')
    return { output: { t1, t2, t3 } }
  })
  .edge('start-parallel', 'task-1')
  .edge('start-parallel', 'task-2')
  .edge('start-parallel', 'task-3')
  .edge('task-1', 'gather')
  .edge('task-2', 'gather')
  .edge('task-3', 'gather')
```

#### `main.ts`
```typescript
import { ConsoleLogger, FlowRuntime } from 'flowcraft'
import { parallelFlow } from './flow.js'

async function main() {
  const blueprint = parallelFlow.toBlueprint()
  const functionRegistry = parallelFlow.getFunctionRegistry()

  const runtime = new FlowRuntime({
    logger: new ConsoleLogger(),
  })

  console.log('Starting parallel workflow...')
  const result = await runtime.run(blueprint, {}, { functionRegistry })

  console.log('\n--- Workflow Complete ---')
  console.log('Final Result:', result.context)
}

main()
```

## The Output

Tasks run in parallel, reducing total time.

```
Starting parallel workflow...
[INFO] Starting workflow execution
[Task 2] Starting...
[Task 3] Starting...
[Task 1] Starting...
[Task 2] Finished.
[Task 3] Finished.
[Task 1] Finished.
[Gather] All tasks finished.
[INFO] Workflow execution completed

--- Workflow Complete ---
Final Result: {
  'start-parallel': 'start',
  'task-1': { data: 'Data from Task 1' },
  'task-2': { data: 'Data from Task 2' },
  'task-3': { data: 'Data from Task 3' },
  'gather': { t1: { data: 'Data from Task 1' }, t2: { data: 'Data from Task 2' }, t3: { data: 'Data from Task 3' } }
}
```

This example shows how to run tasks concurrently for better performance.

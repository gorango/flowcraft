# Basic Workflow

This example demonstrates a basic, linear workflow with sequential steps. It showcases:
- Defining a workflow with [`createFlow`](/api/flow#createflow-id).
- Passing data from one node to the next.
- Executing the workflow with [`FlowRuntime`](/api/runtime#flowruntime-class).

## The Goal

We want to create a workflow that:
1. Starts with an initial step.
2. Processes the data in a second step.
3. Finishes with a final step.

<DemoBasic />

## The Code

The workflow is defined using mock API calls for each step.

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

const basicFlow = createFlow('basic-workflow')
  .node('step-a', () => mockApiCall('Step A', 1000))
  .node('step-b', async ({ input }) => {
    console.log('[Step B] Received input:', input)
    return mockApiCall('Step B', 1500)
  })
  .node('step-c', async ({ input }) => {
    console.log('[Step C] Received input:', input)
    return mockApiCall('Step C', 500)
  })
  .edge('step-a', 'step-b')
  .edge('step-b', 'step-c')
```

#### `main.ts`
```typescript
import { ConsoleLogger, FlowRuntime } from 'flowcraft'
import { basicFlow } from './flow.js'

async function main() {
  const blueprint = basicFlow.toBlueprint()
  const functionRegistry = basicFlow.getFunctionRegistry()

  const runtime = new FlowRuntime({
    logger: new ConsoleLogger(),
  })

  console.log('Starting workflow...')
  const result = await runtime.run(blueprint, {}, { functionRegistry })

  console.log('\n--- Workflow Complete ---')
  console.log('Final Result:', result.context)
}

main()
```

## The Output

When you run this code, you will see the logs from each node executing in sequence.

```
Starting workflow...
[INFO] Starting workflow execution
[Step A] Starting...
[Step A] Finished.
[Step B] Received input: { data: 'Data from Step A' }
[Step B] Starting...
[Step B] Finished.
[Step C] Received input: { data: 'Data from Step B' }
[Step C] Starting...
[Step C] Finished.
[INFO] Workflow execution completed

--- Workflow Complete ---
Final Result: {
  'step-a': { data: 'Data from Step A' },
  'step-b': { data: 'Data from Step B' },
  'step-c': { data: 'Data from Step C' }
}
```

This example forms the foundation for building more complex workflows with Flowcraft.

# Interactive Debugging (Stepper)

This guide covers interactive debugging tools in Flowcraft, designed to help you step through workflow executions, inspect states, and diagnose issues in real-time. The `createStepper` is a first-class feature for building powerful debugging experiences.

## Overview

Flowcraft's `createStepper` utility enables step-by-step execution of workflows, allowing you to inspect the state after each logical step. This is invaluable for debugging complex workflows and writing fine-grained tests where you need to assert the state after each node execution.

<DemoSteps />

## `createStepper`

The `createStepper` utility enables step-by-step execution of workflows, allowing you to inspect the state after each logical step. This is invaluable for debugging complex workflows and writing fine-grained tests where you need to assert the state after each node execution.

### Usage

```typescript
import { createFlow, FlowRuntime } from 'flowcraft'
import { createStepper } from 'flowcraft/testing'

it('should correctly execute step-by-step', async () => {
  const runtime = new FlowRuntime({})
  const flow = createFlow('test')
    .node('a', async () => ({ output: 10 }))
    .node('b', async ({ context }) => ({
      output: (await context.get('a')) * 2
    }))
    .edge('a', 'b')

  const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry())

  // First step (executes node 'a')
  const result1 = await stepper.next()
  expect(stepper.isDone()).toBe(false)
  expect(result1.status).toBe('stalled')
  expect(await stepper.state.getContext().get('_outputs.a')).toBe(10)

  // Second step (executes node 'b')
  const result2 = await stepper.next()
  expect(stepper.isDone()).toBe(true)
  expect(result2.status).toBe('completed')
  expect(await stepper.state.getContext().get('_outputs.b')).toBe(20)

  // Final step (no more work)
  const result3 = await stepper.next()
  expect(result3).toBeNull()
})
```

### Features

- **Step-by-step Control**: Execute workflows one batch of nodes at a time
- **State Inspection**: Access the workflow state and traverser after each step
- **Concurrency Control**: Set concurrency limits per step
- **Cancellation Support**: Cancel execution mid-step with AbortSignal
- **Initial State**: Start workflows with pre-populated context

### Benefits

- **Debugging**: Inspect intermediate states during complex workflows
- **Fine-grained Testing**: Assert on state after each logical step
- **Interactive Tools**: Build debugging or visualization tools
- **Performance Analysis**: Measure execution time per step

## Conclusion

Use `createStepper` to interactively debug and test your workflows step by step. For automated testing, see [Unit & Integration Testing](/guide/testing).

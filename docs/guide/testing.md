# Testing and Debugging

This guide covers testing utilities and debugging tools in Flowcraft, designed to help you verify workflow behavior, diagnose issues, and ensure reliability in complex executions.

## Overview

Flowcraft provides built-in utilities for testing and debugging workflows, especially useful for distributed or complex scenarios. These tools help capture execution details, simulate runs, and inspect internal states without external dependencies.

## Testing Utilities

### `InMemoryEventLogger`

The `InMemoryEventLogger` acts as a "flight recorder" for debugging complex workflow executions. It captures all events emitted during a workflow run, allowing you to inspect the sequence of operations, data flow, and errors in detail.

#### Usage

```typescript
import { createFlow, FlowRuntime } from 'flowcraft'
import { InMemoryEventLogger } from 'flowcraft/testing'

it('should capture events for a workflow run', async () => {
  const eventLogger = new InMemoryEventLogger()
  const runtime = new FlowRuntime({ eventBus: eventLogger })

  const flow = createFlow('my-workflow')
    .node('a', () => ({ output: 'done' }))

  await runtime.run(flow.toBlueprint())

  // You can now inspect the captured events
  const startEvent = eventLogger.find('workflow:start')
  expect(startEvent.payload.blueprintId).toBe('my-workflow')
})
```

#### Benefits

- **Non-Intrusive**: Captures events without modifying workflow logic.
- **Detailed Trace**: Records node executions, context changes, and errors.
- **In-Memory**: Fast and lightweight, ideal for unit tests or local debugging.

### `runWithTrace`

The `runWithTrace` helper is the ideal tool for most workflow integration tests. It executes a workflow and automatically prints a detailed execution trace to the console if, and only if, the run fails.

To enable tracing for *all* executions (including successful ones) for deeper debugging, you can set the `DEBUG` environment variable to `true`.

#### Usage

```typescript
import { createFlow, FlowRuntime } from 'flowcraft'
import { runWithTrace } from 'flowcraft/testing'
import { describe, expect, it } from 'vitest'

describe('User Processing Workflow', () => {
  it('should format user data correctly', async () => {
    const flow = createFlow('user-flow')
      .node('fetch', () => ({ output: { name: 'Alice' } }))
      .node('format', ({ input }) => ({
        // Intentionally introduce a bug for demonstration
        output: `Formatted: ${input.name.toUppercase()}`,
      }))
      .edge('fetch', 'format')

    const runtime = new FlowRuntime({})

    // The 'runWithTrace' helper will catch the error from the 'format' node
    // and print a full execution trace before the test fails.
    try {
      await runWithTrace(runtime, flow.toBlueprint())
    } catch (error) {
      // In a real test, you might assert on the error type or message
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toContain('toUppercase is not a function')
    }
  })
})
```

#### Command Line Usage

```bash
# Run tests, trace will only print for the failing test above
npm test

# Run tests and print traces for ALL workflow runs, even successful ones
DEBUG=true npm test
```

#### Output Example

```
--- Failing Test Trace: my-workflow ---

[1] workflow:start
  - Payload: {"blueprintId":"my-workflow", ...}

[2] node:start
  - Node: "a" | Input: undefined

[3] context:change
  - Node "a" wrote to context -> Key: "a" | Value: "done"

[4] node:finish
  - Node: "a" | Result: {"output":"done"}

[5] workflow:finish
  - Payload: {"blueprintId":"my-workflow", ...}

--- End of Trace ---
```

#### Benefits

- **Visual Debugging**: Provides a clear timeline of node executions.
- **Performance Insights**: Shows execution times for each node.
- **Error Highlighting**: Marks failed nodes and exceptions in the trace.

## Testing with Dependency Injection

The Dependency Injection (DI) container makes testing even easier by allowing you to inject mocks or stubs directly into the runtime. This promotes isolated testing and simplifies verification of interactions.

### Benefits for Testing
- **Easy Mocking**: Register mock implementations for services like loggers or evaluators without modifying code.
- **Isolated Tests**: Test workflows in isolation by controlling all dependencies.
- **Type Safety**: Maintain type safety while using mocks.
- **Backward Compatibility**: Existing tests continue to work with the legacy API.

### Usage Example

```typescript
import { createDefaultContainer, FlowRuntime, ServiceTokens } from 'flowcraft'
import { vi } from 'vitest'

it('should use mock logger in tests', async () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }

  const container = createDefaultContainer({
    registry: { fetchData, processData },
    logger: mockLogger,
  })

  const runtime = new FlowRuntime(container)
  await runtime.run(blueprint)

  // Verify logging calls
  expect(mockLogger.info).toHaveBeenCalledWith('Starting workflow execution', expect.any(Object))
})
```

For more on the DI container, see the [Container API docs](/api/container).

## Best Practices for Testing

- **Unit Test Nodes**: Test individual nodes in isolation using `InMemoryEventLogger` to verify inputs and outputs.
- **Integration Testing**: Use `runWithTrace` for end-to-end workflow tests to ensure correct sequencing.
- **Mock External Dependencies**: In tests, mock adapters or external services to focus on workflow logic.
- **Error Scenarios**: Simulate failures (e.g., network errors) to test error handling and retries.

## Integration with Testing Frameworks

These utilities integrate seamlessly with popular testing frameworks like Vitest or Jest.

```typescript
import { describe, it, expect } from 'vitest'
import { InMemoryEventLogger, runWithTrace } from 'flowcraft/testing'

describe('My Workflow', () => {
  it('should execute correctly', async () => {
    const logger = new InMemoryEventLogger()
    const result = await runWorkflow(workflow, context, { logger })

    expect(result).toBeDefined()
    expect(logger.events.some(e => e.type === 'node:success')).toBe(true)
  })

  it('should print trace when DEBUG is set', async () => {
    process.env.DEBUG = 'true'
    await runWithTrace(workflow, context)
    // Trace will be printed to console
  })
})
```

## Conclusion

Leverage `InMemoryEventLogger` and `runWithTrace` to build robust tests and debug workflows effectively. For more on error handling and best practices, see [Error Handling](/guide/error-handling) and [Best Practices](/guide/best-practices).

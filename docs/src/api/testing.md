# Testing

Flowcraft provides utilities for testing and debugging workflows, including step-by-step execution, event logging, and trace helpers.

## `createStepper`

Creates a stepper for interactive, step-by-step execution of workflows.

### Signature

```typescript
function createStepper<TContext extends Record<string, any> = Record<string, any>, TDependencies extends RuntimeDependencies = RuntimeDependencies>(
  runtime: IRuntime<TContext, TDependencies>,
  blueprint: WorkflowBlueprint,
  functionRegistry: Map<string, NodeFunction | NodeClass>,
  options?: {
    concurrency?: number
    signal?: AbortSignal
    initialState?: Partial<TContext>
  }
): Promise<Stepper<TContext, TDependencies>>
```

### Parameters

- **`runtime`**: The runtime instance to use for execution.
- **`blueprint`**: The workflow blueprint to execute.
- **`functionRegistry`**: A map of node implementations.
- **`options`** (optional):
  - **`concurrency`**: Maximum number of nodes to execute concurrently (default: 1).
  - **`signal`**: AbortSignal to cancel execution.
  - **`initialState`**: Initial context state.

### Returns

A `Stepper` instance with methods for step-by-step control.

### Example

```typescript
import { createStepper } from 'flowcraft/testing'

const stepper = await createStepper(runtime, blueprint, registry)
const result = await stepper.next()
```

## `runWithTrace`

Executes a workflow and prints a detailed trace on failure or when `DEBUG` is set.

### Signature

```typescript
function runWithTrace<TContext extends Record<string, any> = Record<string, any>, TDependencies extends RuntimeDependencies = RuntimeDependencies>(
  runtime: IRuntime<TContext, TDependencies>,
  blueprint: WorkflowBlueprint,
  options?: {
    functionRegistry?: Map<string, NodeFunction | NodeClass>
    initialState?: Partial<TContext>
    signal?: AbortSignal
  }
): Promise<WorkflowResult<TContext>>
```

### Parameters

- **`runtime`**: The runtime instance.
- **`blueprint`**: The workflow blueprint.
- **`options`** (optional):
  - **`functionRegistry`**: Node implementations.
  - **`initialState`**: Initial context.
  - **`signal`**: AbortSignal.

### Returns

Promise resolving to the workflow result.

### Example

```typescript
import { runWithTrace } from 'flowcraft/testing'

await runWithTrace(runtime, blueprint)
```

## `InMemoryEventLogger`

An event bus implementation that captures events in memory for testing.

### Signature

```typescript
class InMemoryEventLogger implements IEventBus {
  constructor()
  emit(event: FlowcraftEvent): void
  on(eventType: string, listener: (event: FlowcraftEvent) => void): void
  off(eventType: string, listener: (event: FlowcraftEvent) => void): void
  find(eventType: string): FlowcraftEvent | undefined
  clear(): void
}
```

### Methods

- **`emit(event)`**: Emits an event and notifies listeners.
- **`on(eventType, listener)`**: Registers a listener for an event type.
- **`off(eventType, listener)`**: Removes a listener.
- **`find(eventType)`**: Finds the first event of the given type.
- **`clear()`**: Clears all captured events.

### Example

```typescript
import { InMemoryEventLogger } from 'flowcraft/testing'

const logger = new InMemoryEventLogger()
const runtime = new FlowRuntime({ eventBus: logger })
await runtime.run(blueprint)
const event = logger.find('node:finish')
```
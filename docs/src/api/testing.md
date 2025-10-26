# Testing

Flowcraft provides utilities for testing and debugging workflows, including step-by-step execution, event logging, and trace helpers.

## `createStepper`

Creates a stepper for interactive, step-by-step execution of workflows.

### Signature

```typescript
function createStepper<TContext extends Record<string, any> = Record<string, any>, TDependencies extends RuntimeDependencies = RuntimeDependencies>(
   runtime: FlowRuntime<TContext, TDependencies>,
   blueprint: WorkflowBlueprint,
   functionRegistry: Map<string, NodeFunction | NodeClass>,
   initialState?: Partial<TContext>
): Promise<IWorkflowStepper<TContext>>
```

### Parameters

- **`runtime`**: The `FlowRuntime` instance to use for execution.
- **`blueprint`**: The workflow blueprint to execute.
- **`functionRegistry`**: A map of node implementations.
- **`initialState`** (optional): Initial context state.

### Returns

A Promise resolving to an `IWorkflowStepper` instance with methods for step-by-step control.

### Example

```typescript
import { createStepper } from 'flowcraft/testing'

const stepper = await createStepper(runtime, blueprint, registry)
const result = await stepper.next()
```

## `IWorkflowStepper` Interface

The `IWorkflowStepper` interface provides methods for step-by-step workflow execution.

```typescript
interface IWorkflowStepper<TContext extends Record<string, any>> {
  readonly state: WorkflowState<TContext>
  readonly traverser: GraphTraverser
  next(options?: { signal?: AbortSignal; concurrency?: number }): Promise<WorkflowResult<TContext> | null>
  prev(): Promise<WorkflowResult<TContext> | null>
  reset(): void
  isDone(): boolean
}
```

### Methods

- **`state`**: The current state of the workflow.
- **`traverser`**: The graph traverser instance.
- **`next(options?)`**: Executes the next batch of ready nodes. Returns the result or null if done.
- **`prev()`**: Reverts to the previous state. Returns the result or null if no history.
- **`reset()`**: Resets the stepper to initial state.
- **`isDone()`**: Checks if the workflow has more steps.

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
   readonly events: FlowcraftEvent[]
   constructor()
   emit(event: FlowcraftEvent): Promise<void>
   clear(): void
   find<T extends FlowcraftEvent['type']>(type: T): Extract<FlowcraftEvent, { type: T }> | undefined
   filter<T extends FlowcraftEvent['type']>(type: T): Extract<FlowcraftEvent, { type: T }>[]
   printLog(title?: string): void
}
```

### Methods

- **`events`**: Array of captured events.
- **`emit(event)`**: Captures the event in the array.
- **`clear()`**: Clears all captured events.
- **`find(type)`**: Finds the first event of the given type.
- **`filter(type)`**: Filters events by type.
- **`printLog(title?)`**: Prints a formatted log of all events.

### Example

```typescript
import { InMemoryEventLogger } from 'flowcraft/testing'

const logger = new InMemoryEventLogger()
const runtime = new FlowRuntime({ eventBus: logger })
await runtime.run(blueprint)
const event = logger.find('node:finish')
const retryEvents = logger.filter('node:retry')
logger.printLog('Execution Trace')
```
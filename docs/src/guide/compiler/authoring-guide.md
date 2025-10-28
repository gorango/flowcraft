# Authoring Guide

This guide covers how to write TypeScript code that the Flowcraft Compiler can transform into declarative workflows.

## The Golden Rules

### 1. Mark Orchestrator Functions with `/** @flow */`

Functions that define workflow orchestration must be marked with the `/** @flow */` JSDoc comment:

```typescript
/** @flow */
export async function myWorkflow(input: string) {
  // Your workflow logic here
}
```

### 2. Mark Durable Operations with `/** @step */`

Any async operation that should be durable (retried on failure, tracked in execution history) must be marked at the function declaration:

```typescript
/** @flow */
export async function myWorkflow(input: string) {
  const data = await fetchData(input)

  const result = await processData(data)

  return result
}

/** @step */
async function fetchData(input: string) {
  // Implementation
}

/** @step */
async function processData(data: any) {
  // Implementation
}
```

### 3. Never Await Plain Async Functions

The compiler will throw an error if you try to await a function that isn't marked with `/** @step */`:

```typescript
// ❌ This will cause a compile error
/** @flow */
export async function myWorkflow() {
  const helper = async () => 'hello'
  const result = await helper() // Error: Cannot await non-step function
}

// ✅ Correct approach
/** @flow */
export async function myWorkflow() {
  const result = await helperStep()
}

/** @step */
async function helperStep() {
  return 'hello'
}
```

## Supported Control Flow

### Sequential Execution

```typescript
/** @flow */
export async function sequentialWorkflow() {
  const a = await stepA()

  const b = await stepB(a)

  const c = await stepC(b)

  return c
}

/** @step */
async function stepA() {
  // Implementation
}

/** @step */
async function stepB(input: any) {
  // Implementation
}

/** @step */
async function stepC(input: any) {
  // Implementation
}
```

### Conditional Branching

```typescript
/** @flow */
export async function conditionalWorkflow(input: number) {
  if (input > 10) {
    return await handleLargeInput(input)
  } else {
    return await handleSmallInput(input)
  }
}

/** @step */
async function handleLargeInput(input: number) {
  // Implementation
}

/** @step */
async function handleSmallInput(input: number) {
  // Implementation
}
```

### Fallbacks with Try/Catch

```typescript
/** @flow */
export async function resilientWorkflow() {
  try {
    return await riskyOperation()
  } catch (error) {
    return await fallbackOperation(error)
  }
}

/** @step */
async function riskyOperation() {
  // Implementation
}

/** @step */
async function fallbackOperation(error: any) {
  // Implementation
}
```

### Loops

```typescript
/** @flow */
export async function loopWorkflow(items: string[]) {
  const results = []

  for (const item of items) {
    const result = await processItem(item)
    results.push(result)
  }

  return results
}

/** @flow */
export async function whileWorkflow() {
  let count = 0

  while (count < 10) {
    await incrementCounter()
    count++
  }
}

/** @step */
async function processItem(item: string) {
  // Implementation
}

/** @step */
async function incrementCounter() {
  // Implementation
}
```

### Loop Control

```typescript
/** @flow */
export async function controlledLoop(items: number[]) {
  for (const item of items) {
    if (item < 0) continue

    const result = await processItem(item)

    if (result === 'stop') break
  }
}

/** @step */
async function processItem(item: number) {
  // Implementation
}
```

### Parallelism with Promise.all

```typescript
/** @flow */
export async function parallelWorkflow(items: string[]) {
  const promises = items.map(item =>
    processItem(item)
  )

  return await Promise.all(promises)
}

/** @step */
async function processItem(item: string) {
  // Implementation
}
```

## Subflows: Composing Workflows

Subflows are created naturally by importing and awaiting other `/** @flow */` functions:

```typescript
// subflow.ts
/** @flow */
export async function subWorkflow(input: string) {
  const processed = await processData(input)

  return await saveResult(processed)
}

// main-workflow.ts
import { subWorkflow } from './subflow'

/** @flow */
export async function mainWorkflow(input: string) {
  const validated = await validateInput(input)

  // This creates a subflow node in the compiled blueprint
  const result = await subWorkflow(validated)

  return await finalizeResult(result)
}

/** @step */
async function validateInput(input: string) {
  // Implementation
}

/** @step */
async function finalizeResult(result: any) {
  // Implementation
}

/** @step */
async function processData(input: string) {
  // Implementation
}

/** @step */
async function saveResult(processed: any) {
  // Implementation
}
```

## Unsupported Syntax

The compiler currently does not support:

- `finally` blocks in try/catch statements
- Complex variable re-assignments within loops
- Dynamic function calls or eval
- Generator functions or async generators
- Class methods as steps (use standalone functions)

If you encounter unsupported syntax, consider refactoring to use supported patterns or fall back to the Fluent API for that specific part of your workflow.
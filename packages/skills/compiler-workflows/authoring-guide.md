# Compiler Authoring Guide

Detailed guidance for writing TypeScript code that the Flowcraft Compiler can transform into declarative workflows.

## The Golden Rules

### 1. Mark Orchestrator Functions with `/** @flow */`

Functions that define workflow orchestration must be marked:

```typescript
/** @flow */
export async function myWorkflow(input: string) {
	// Your workflow logic here
}
```

### 2. Mark Durable Operations with `/** @step */`

Any async operation that should be durable (retried, tracked) must be marked:

```typescript
/** @step */
async function fetchData(input: string) {
	return fetch(`/api/data?q=${input}`).then((r) => r.json())
}

/** @step */
async function processData(data: unknown) {
	return { processed: true, data }
}
```

### 3. Never Await Plain Async Functions

The compiler errors if you await a function that isn't marked `@step`:

```typescript
// ❌ Compile error
/** @flow */
export async function badWorkflow() {
	const helper = async () => 'hello'
	const result = await helper() // Error: Cannot await non-step function
}

// ✅ Correct
/** @flow */
export async function goodWorkflow() {
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

/** @step */ async function stepA() {
	/* ... */
}
/** @step */ async function stepB(input: any) {
	/* ... */
}
/** @step */ async function stepC(input: any) {
	/* ... */
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

/** @step */ async function handleLargeInput(input: number) {
	/* ... */
}
/** @step */ async function handleSmallInput(input: number) {
	/* ... */
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

/** @step */ async function riskyOperation() {
	/* ... */
}
/** @step */ async function fallbackOperation(error: any) {
	/* ... */
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

/** @step */ async function processItem(item: string) {
	/* ... */
}
/** @step */ async function incrementCounter() {
	/* ... */
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

/** @step */ async function processItem(item: number) {
	/* ... */
}
```

### Parallelism with Promise.all

```typescript
/** @flow */
export async function parallelWorkflow(items: string[]) {
	const promises = items.map((item) => processItem(item))
	return await Promise.all(promises)
}

/** @step */ async function processItem(item: string) {
	/* ... */
}
```

## Subflows: Composing Workflows

Subflows are created by importing and awaiting other `@flow` functions:

```typescript
// subflow.ts
/** @flow */
export async function subWorkflow(input: string) {
	const processed = await processData(input)
	return await saveResult(processed)
}

/** @step */ async function processData(input: string) {
	/* ... */
}
/** @step */ async function saveResult(processed: any) {
	/* ... */
}

// main-workflow.ts
import { subWorkflow } from './subflow'

/** @flow */
export async function mainWorkflow(input: string) {
	const validated = await validateInput(input)
	const result = await subWorkflow(validated) // Creates subflow node
	return await finalizeResult(result)
}

/** @step */ async function validateInput(input: string) {
	/* ... */
}
/** @step */ async function finalizeResult(result: any) {
	/* ... */
}
```

## Unsupported Syntax

The compiler currently does not support:

- `finally` blocks in try/catch statements
- Complex variable re-assignments within loops
- Dynamic function calls or `eval`
- Generator functions or async generators
- Class methods as steps (use standalone functions)

If you encounter unsupported syntax, refactor to use supported patterns or fall back to the Fluent API for that specific part.

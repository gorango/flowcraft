# Built-in Nodes

This example demonstrates Flowcraft's built-in node types that provide common workflow patterns out of the box. These nodes handle complex orchestration logic without requiring custom implementation.

## Overview

Flowcraft includes several built-in node types for common workflow patterns:

- **Batch Processing**: Scatter-gather pattern for parallel processing
- **Loops**: Conditional iteration with automatic loop control
- **Wait/Sleep**: Pausing execution for timers or external input
- **Subflows**: Executing reusable workflow components

This example shows how to use each of these built-in nodes with the Fluent API methods.

## Running the Example

```bash
# Install dependencies
pnpm install

# Run the example
pnpm start
```

## What You'll Learn

### 1. Batch Processing with `.batch()`

The `.batch()` method automatically creates scatter-gather nodes for parallel processing:

```typescript
flow.batch('processItems', processBatchItem, {
	inputKey: 'batchItems', // Array to process
	outputKey: 'processedItems', // Results array
})
```

**Key Features:**

- Automatic parallel execution of worker nodes
- Built-in error handling and aggregation
- Context key mapping for input/output

### 2. Loops with `.loop()`

The `.loop()` method creates conditional iteration:

```typescript
flow.loop('counterLoop', {
	startNodeId: 'executeIteration',
	endNodeId: 'executeIteration',
	condition: 'loopData.counter < loopData.maxIterations',
})
```

**Key Features:**

- Automatic loop controller node generation
- Expression-based conditions (requires `UnsafeEvaluator`)
- Clean separation of loop logic and iteration body

### 3. Sleep Nodes with `.sleep()`

The `.sleep()` method pauses execution for a duration:

```typescript
flow.sleep('wait5Seconds', { duration: '5s' })
```

**Key Features:**

- Multiple duration formats (`'5s'`, `'1m'`, `'2h'`, `'1d'`, or milliseconds)
- Automatic resumption when timer expires
- Durable timers that persist across restarts

### 4. Wait Nodes with `.wait()`

The `.wait()` method pauses for external input:

```typescript
flow.wait('wait-for-approval')
```

**Key Features:**

- Human-in-the-Loop (HITL) workflows
- External input via `runtime.resume()`
- Action-based conditional branching

### 5. Subflows with Manual Node Creation

Subflows execute reusable workflow components:

```typescript
// Create subflow blueprint
const validationBlueprint = createValidationSubflow().toBlueprint()

// Add subflow node manually
blueprint.nodes?.push({
	id: 'validationSubflow',
	uses: 'subflow',
	params: {
		blueprintId: validationBlueprint.id,
		inputs: { inputData: 'inputData' },
		outputs: { validationResults: 'checkCompleteness' },
	},
})
```

**Key Features:**

- Modular workflow composition
- Input/output mapping between parent and subflow
- Error propagation and debugging

## Expected Output

```
🚀 Flowcraft Built-in Nodes Examples

============================================================
📦 BATCH PROCESSING EXAMPLE
============================================================

📦 [Prepare] Preparing data for batch processing...
📦 Prepared 5 items for batch processing
⚙️ [Process Item] Processing batch item...
   Processing: Item A (ID: 1)
   ✅ Completed: Item A - standard
⚙️ [Process Item] Processing batch item...
   Processing: Item B (ID: 2)
   ✅ Completed: Item B - standard
...

📊 Batch Processing Results:
   Total items processed: 5
   High-value items: 2
   Total value: 250
   Premium quality items: 2
   Sample processed items:
     1. Item A (standard) - standard
     2. Item B (standard) - standard
     3. Item C (high-value) - premium

✅ Batch processing completed successfully

============================================================
🔄 LOOP PROCESSING EXAMPLE
============================================================

🔄 [Setup Loop] Setting up data for loop demonstration...
🔄 Loop data initialized
🔁 [Loop] Executing loop iteration...
🔁 Completed iteration 1/5
🔁 [Loop] Executing loop iteration...
🔁 Completed iteration 2/5
...

📈 Loop Processing Results:
   Total iterations: 5
   All iterations completed successfully
   Sample results:
     1. Iteration 1 at 2024-01-15T10:30:00.000Z
     2. Iteration 2 at 2024-01-15T10:30:00.000Z

✅ Loop processing completed successfully

============================================================
⏳ WAIT/SLEEP EXAMPLE
============================================================

⏳ [Wait Demo] Demonstrating wait functionality...
⏳ Initiated wait sequence...
⏰ [After Wait] Processing after wait completion...
⏰ Wait completed after 5000ms

⏰ Wait Processing Results:
   Wait started: 2024-01-15T10:30:00.000Z
   Wait ended: 2024-01-15T10:30:05.000Z
   Duration: 5000ms

✅ Wait processing completed successfully

============================================================
🔗 SUBFLOW EXAMPLE
============================================================

🚀 [Main] Starting main workflow with subflows...
✅ [Subflow 1] Validating input data...
🔍 [Subflow 1] Checking data completeness...
🏷️ [Subflow 2] Adding metadata...
📊 [Subflow 2] Calculating insights...
🎯 [Main] Processing subflow results...

🎯 Subflow Processing Results:
   Original data: John Doe (john.doe@example.com)
   Validation score: 3/3
   Age group: adult
   Email domain: example.com
   Processing completed: 2024-01-15T10:30:05.000Z

✅ Subflow processing completed successfully

🎉 All built-in nodes examples completed!
```

## Key Concepts Demonstrated

- **Built-in Node Types**: Using Flowcraft's pre-built orchestration nodes
- **Fluent API Methods**: Convenient methods for common patterns (`.batch()`, `.loop()`, `.sleep()`, `.wait()`)
- **Parallel Execution**: Automatic parallelization with scatter-gather
- **Conditional Logic**: Expression-based conditions with `UnsafeEvaluator`
- **Workflow Composition**: Modular subflows for reusable logic
- **State Management**: Context passing between nodes and workflows
- **Error Handling**: Built-in error propagation and handling

## Files

- `src/workflow.ts` - Workflow definitions using built-in nodes
- `src/main.ts` - Runtime setup and execution of all examples
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration

## Security Note

The loop condition uses comparison operators (`<`), which requires `UnsafeEvaluator`. In production, consider using a sandboxed evaluator for security:

```typescript
import { FlowRuntime, UnsafeEvaluator } from 'flowcraft'

const runtime = new FlowRuntime({
	evaluator: new UnsafeEvaluator(), // Only for trusted environments
})
```

## Next Steps

After understanding built-in nodes, explore:

- `context-state-management` - Advanced context manipulation patterns
- `function-class-nodes` - Different ways to implement node logic
- `middleware` - Adding cross-cutting concerns to workflows
- `llm-workflows` - AI-powered workflow examples

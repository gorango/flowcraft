# Loops, Cycles & Subflows

This example demonstrates how to use loops, retry patterns, and subflows in Flowcraft. It covers single-node loops, multi-node loop bodies, retry-with-early-exit, and subflow composition using the `SubflowNode` builder API.

## Overview

The example runs four workflow demos:

1. **Simple Loop** — A single-node loop that increments a counter to 5
2. **Multi-Node Loop** — A loop body with `process -> mark-complete` that drains a task queue
3. **Subflow** — A parent workflow that delegates to a child subflow using `SubflowNode`
4. **Retry Loop** — A loop with a conditional early exit on success

## Running the Example

```bash
# Install dependencies
pnpm install

# Run the example
pnpm start
```

## What You'll Learn

### 1. Simple Loop

Use `.loop()` to create a loop controller. The controller evaluates a condition on each iteration and either continues into the body or breaks out.

```typescript
flow
	.node('initialize', initialize)
	.node('increment', increment)
	.edge('initialize', 'counter') // Entry edge to loop controller
	.edge('counter', 'done') // Break edge
	.loop('counter', {
		startNodeId: 'increment',
		endNodeId: 'increment',
		condition: 'counter < maxIterations',
	})
```

### 2. Multi-Node Loop

For loop bodies with multiple nodes, add an entry edge from the predecessor to the loop controller. The loop controller resets body nodes on each iteration so they can re-execute.

```typescript
flow
	.node('prepare', prepareItems)
	.node('process', processItem)
	.node('markComplete', markComplete)
	.edge('prepare', 'itemLoop') // Entry edge to loop controller
	.edge('process', 'markComplete') // Body edges
	.edge('itemLoop', 'done') // Break edge
	.loop('itemLoop', {
		startNodeId: 'process',
		endNodeId: 'markComplete',
		condition: 'items.length > 0',
	})
```

### 3. Subflow with `SubflowNode`

Use the exported `SubflowNode` class for type-safe subflow registration. Register the child blueprint in the runtime's `blueprints` option.

```typescript
import { SubflowNode } from 'flowcraft'

const childFlow = createFlow('child')
	.node('validate', validateFn)
	.node('enrich', enrichFn)
	.edge('validate', 'enrich')

const parentFlow = createFlow('parent')
	.node('prepare', prepareFn)
	.node('runChild', SubflowNode, {
		params: {
			blueprintId: 'child',
			inputs: { inputData: 'items' },
		},
	})
	.edge('prepare', 'runChild')
```

### 4. Retry with Conditional Exit

Loop controllers support conditional edges for early exit. Combine the loop condition with a conditional edge to retry until success or a max attempt count.

```typescript
flow
	.node('attempt', attemptFn)
	.loop('retry', {
		startNodeId: 'attempt',
		endNodeId: 'attempt',
		condition: 'counter < 5',
	})
	// Early exit when operation succeeds
	.edge('retry', 'success', { condition: 'success === true' })
```

## Expected Output

```
🚀 Flowcraft Loops, Cycles & Subflows Example

============================================================
🔄 SIMPLE LOOP
============================================================
   Initialized counter=0, maxIterations=5
   Iteration 1
   Iteration 2
   Iteration 3
   Iteration 4
   Iteration 5
   Loop finished

✅ Simple loop completed
   Counter: 5
   Status: completed

============================================================
🔄 MULTI-NODE LOOP
============================================================
   Prepared 3 items
   Processing: task-1
   Completed: task-1 (2 remaining)
   Processing: task-2
   Completed: task-2 (1 remaining)
   Processing: task-3
   Completed: task-3 (0 remaining)
   Loop finished

✅ Multi-node loop completed
   Items processed: 3
   Status: completed

============================================================
📦 SUBFLOW
============================================================
   Prepared 3 items
   Validating: ["task-1","task-2","task-3"]
   Enriching: {"valid":true,"data":["task-1","task-2","task-3"]}
   Loop finished

✅ Subflow completed
   Status: completed

============================================================
🔄 RETRY LOOP (with early exit)
============================================================
   Attempt 1: failed, retrying
   Attempt 2: failed, retrying
   Attempt 3: success
   Operation completed successfully

✅ Retry loop completed
   Attempts: 3
   Status: completed

🎉 Loops, cycles & subflows example completed!
```

## Key Concepts Demonstrated

- **Loops**: Use `.loop()` to define iterative workflows with a condition
- **Entry Edges**: Add `edge('predecessor', 'loopId')` so the loop controller has an entry point
- **Node Reset**: Loop controllers automatically reset body nodes for re-execution
- **Conditional Exit**: Use conditional edges from the loop controller for early loop exit
- **Subflows**: Use `SubflowNode` class for type-safe nested workflow composition
- **Join Strategy**: Loop controllers use `joinStrategy: 'any'` to allow re-entry

## Files

- `src/workflow.ts` — Node implementations and workflow factory functions
- `src/main.ts` — Runtime setup and execution
- `package.json` — Dependencies and scripts
- `tsconfig.json` — TypeScript configuration

## Next Steps

- `hitl-workflow` — Human-in-the-loop patterns with wait nodes
- `middleware` — Adding custom middleware to workflows
- `core-api/built-in-nodes` — All built-in node types in depth

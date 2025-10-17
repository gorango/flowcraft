# Subflows

As workflows grow in complexity, it becomes useful to break them down into smaller, reusable components. Flowcraft supports this through **subflows**.

A subflow is a standard [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface) that can be executed as a single node within another (parent) workflow. This allows you to encapsulate logic, promote reuse, and keep your main workflow graphs clean and organized.

## The `subflow` Node

You can run a subflow by defining a node with `uses: 'subflow'`. This is a built-in node type that the [`FlowRuntime`](/api/runtime#flowruntime-class) knows how to handle.

The `params` for a subflow node are critical:
-   **`blueprintId`**: The ID of the [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface) to execute. This blueprint must be available in the [`FlowRuntime`](/api/runtime#flowruntime-class)'s `blueprints` registry.
-   **`inputs`** (optional): An object mapping keys in the subflow's initial context to keys in the parent workflow's context. This is how you pass data *into* the subflow.
-   **`outputs`** (optional): An object mapping keys in the parent workflow's context to keys in the subflow's *final* context. This is how you get data *out of* the subflow.

## Example: A Reusable Subflow

Let's create a subflow that adds two numbers and a parent workflow that uses it.

#### 1. Define the Subflow

```typescript
// subflow.ts
import { createFlow } from 'flowcraft'

export const mathSubflowBlueprint = createFlow('math-subflow')
	.node('add', async ({ context }) => {
		const a = await context.get('a')
		const b = await context.get('b')
		const sum = a + b
		// The result is stored in the subflow's context.
		return { output: sum }
	})
	.toBlueprint()
```

#### 2. Define the Parent Workflow

```typescript
// parent-flow.ts
import { createFlow } from 'flowcraft'

export const parentFlow = createFlow('parent-workflow')
	.node('prepare-data', async ({ context }) => {
		// Set up data in the parent context.
		await context.set('val1', 10)
		await context.set('val2', 20)
		return { output: 'Data ready' }
	})
	.node('run-math', {
		uses: 'subflow', // Use the built-in subflow runner
		params: {
			blueprintId: 'math-subflow',
			// Map parent context keys to subflow context keys
			inputs: {
				a: 'val1',
				b: 'val2',
			},
			// Map parent context key to a subflow result key
			outputs: {
				addition_result: 'add' // 'add' is the ID of the node in the subflow
			}
		}
	})
	.edge('prepare-data', 'run-math')
```

#### 3. Set Up the Runtime

The key is to provide all necessary blueprints to the [`FlowRuntime`](/api/runtime#flowruntime-class) constructor.

```typescript
// main.ts
import { FlowRuntime } from 'flowcraft'
import { parentFlow } from './parent-flow'
import { mathSubflowBlueprint } from './subflow'

const runtime = new FlowRuntime({
	// The runtime needs access to all blueprints it might be asked to run.
	blueprints: {
		'math-subflow': mathSubflowBlueprint
	},
	// The registry only needs the implementations from the parent flow.
	registry: parentFlow.getFunctionRegistry()
})

const result = await runtime.run(parentFlow.toBlueprint(), {})
console.log(result.context)
// {
//   val1: 10,
//   val2: 20,
//   prepare_data: 'Data ready',
//   run_math: { a: 10, b: 20, add: 30 }, // Subflow's final context
//   addition_result: 30 // Mapped output
// }
```

This modular approach is invaluable for building large, maintainable workflow systems.

## Error Handling in Subflows

When a subflow fails, the error is propagated to the parent workflow with details for better debugging. The `NodeExecutionError` thrown by a failed subflow includes:

- The original error message from the specific node that failed within the subflow
- The node ID where the failure occurred
- The stack trace from the subflow's execution

This allows you to trace failures back to their source, even in deeply nested subflow hierarchies.

```typescript
// Example: Handling subflow errors
try {
  const result = await runtime.run(parentFlow.toBlueprint(), {})
} catch (error) {
  if (error instanceof NodeExecutionError) {
    console.log(`Subflow failed: ${error.message}`)
    if (error.originalError) {
      console.log(`Original error: ${error.originalError.message}`)
      console.log(`Failed node in subflow: ${error.originalError.nodeId}`)
    }
  }
}
```

If a subflow fails, it will prevent the parent workflow from continuing unless handled appropriately (e.g., via retries or fallbacks).

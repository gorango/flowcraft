# Defining Workflows

Workflows are defined programmatically using the fluent [`Flow`](/api/flow#flow-class) builder API. This provides a strongly-typed and intuitive way to construct your [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface) with compile-time type safety.

## Defining Context Types

Before creating workflows, define the shape of your context data using a TypeScript interface:

```typescript
interface UserProcessingContext {
  user_data?: { id: number; name: string }
  validation_result?: boolean
  processing_status?: 'pending' | 'completed' | 'failed'
}
```

## Using `createFlow`

The entry point to the builder is the [`createFlow`](/api/flow#createflow-id) function. It takes a unique ID for your workflow and is generic over your context type for full type safety.

```typescript
import { createFlow } from 'flowcraft'

// Providing the context type is optional, but recommended
const flowBuilder = createFlow<UserProcessingContext>('my-first-workflow')
```

## Adding Nodes with `.node()`

You add tasks to your workflow using the `.node()` method. Node functions receive a strongly-typed [`NodeContext`](/api/nodes-and-edges#nodecontext-interface) that provides access to the typed context.

```typescript
const flowBuilder = createFlow<UserProcessingContext>('user-processing')
	// A simple function-based node with type safety
	.node('fetch-user', async ({ context }) => {
		const user = { id: 1, name: 'Alice' }
		await context.set('user_data', user)
		return { output: user }
	})
	// A node with type-safe input handling
	.node('validate-user', async ({ context, input }) => {
		const userData = input as { id: number; name: string }
		const isValid = userData.name === 'Alice'

		await context.set('validation_result', isValid)
		return {
			output: isValid,
			action: isValid ? 'valid' : 'invalid'
		}
	}, {
		// This tells the runtime to provide the output of 'fetch-user'
		// as the 'input' for this node.
		inputs: 'fetch-user'
	})
```

## Adding Edges with `.edge()`

Edges define the dependencies and control flow between nodes. You create them with the `.edge()` method, specifying the `source` and `target` node IDs.

```typescript
const flowBuilder = createFlow<UserProcessingContext>('user-processing')
	.node('fetch-user', /* ... */)
	.node('validate-user', /* ... */)
	.node('process-valid', async ({ context }) => {
		// Type-safe context access in downstream nodes
		const userData = await context.get('user_data')
		const validation = await context.get('validation_result')

		await context.set('processing_status', 'completed')
		return { output: `Processed user ${userData?.name}` }
	})
	.node('handle-invalid', async ({ context }) => {
		await context.set('processing_status', 'failed')
		return { output: 'Invalid user data' }
	})

	// Basic edge: runs 'validate-user' after 'fetch-user'
	.edge('fetch-user', 'validate-user')

	// Conditional edges based on the 'action' returned by 'validate-user'
	.edge('validate-user', 'process-valid', { action: 'valid' })
	.edge('validate-user', 'handle-invalid', { action: 'invalid' })
```

This workflow can be visualized as:

<script setup>
import { ref } from 'vue'

const nodes = ref([
	{ id: 'fetch-user', type: 'input', label: 'fetch-user', position: { x: 250, y: 20 } },
	{ id: 'validate-user', label: 'validate-user', position: { x: 250, y: 100 } },
	{ id: 'process-valid', type: 'output', label: 'process-valid', position: { x: 100, y: 200 } },
	{ id: 'handle-invalid', type: 'output', label: 'handle-invalid', position: { x: 400, y: 200 } },
])

const edges = ref([
	{ id: 'e1', source: 'fetch-user', target: 'validate-user', animated: true },
	{ id: 'e2', source: 'validate-user', target: 'process-valid', label: 'valid', animated: true },
	{ id: 'e3', source: 'validate-user', target: 'handle-invalid', label: 'invalid', animated: true },
])
</script>

<Flow :nodes="nodes" :edges="edges" />

## Type Safety Benefits

The strongly-typed workflow system provides:

- **Context key validation**: Only valid keys from your interface can be accessed
- **Precise type inference**: Context values have exact types, not `any`
- **IntelliSense support**: Full autocomplete for context keys and their types
- **Compile-time error prevention**: Type mismatches caught during development

## Finalizing the Blueprint

Once your workflow is defined, call [`.toBlueprint()`](/api/flow#toblueprint) to get the serializable [`WorkflowBlueprint`](/api/flow#workflowblueprint-interface) object. You will also need the function registry, which contains the node implementations.

```typescript
// Continuing from above...
const blueprint = flowBuilder.toBlueprint()
const functionRegistry = flowBuilder.getFunctionRegistry()

// Now you can pass these to the FlowRuntime with type safety
// const runtime = new FlowRuntime({ registry: functionRegistry });
// const result = await runtime.run(blueprint, { user_data: initialUser });
```

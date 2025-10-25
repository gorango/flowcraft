<script setup>
import GettingStarted from '../.vitepress/theme/components/Demo/GettingStarted.vue'
</script>

# Getting Started

This guide will walk you through installing Flowcraft and running your first strongly-typed workflow.

## Installation

Install Flowcraft into your project using your preferred package manager:

```bash
npm install flowcraft
```

## Your First Workflow

Let's create a simple workflow with two steps: one node to provide a starting number, and a second node to double it, using Flowcraft's strongly-typed context system.

1.  Create a new file named `simple-flow.ts`.
2.  Add the following code:

```typescript
import { ConsoleLogger, createFlow, FlowRuntime } from 'flowcraft'

// 1. Define your context interface for type safety (optional)
interface SimpleWorkflowContext {
  initial_value?: number
  doubled_value?: number
}

// 2. Define the workflow structure with (optional) strong typing
const flow = createFlow<SimpleWorkflowContext>('simple-workflow')
	// The first node, 'start', takes no input and outputs the number 42.
	.node('start', async ({ context }) => {
		const value = 42
		// Type-safe context access
		await context.set('initial_value', value)
		return { output: value }
	})
	// The second node, 'double', depends on 'start'.
	// Its input is automatically the output of its single predecessor.
	.node('double', async ({ context, input }) => {
		const doubled = input * 2
		// Type-safe context operations
		await context.set('doubled_value', doubled)
		return { output: doubled }
	})
	// Define the dependency: 'start' must run before 'double'.
	.edge('start', 'double')
	// Finalize the definition into a serializable blueprint.
	.toBlueprint()

// 3. Set up the runtime
// The runtime needs the implementations of the nodes, which are
// collected by the flow builder.
const runtime = new FlowRuntime({
	logger: new ConsoleLogger(),
	registry: flow.getFunctionRegistry(),
})

// 4. Run the workflow
async function run() {
	// Start the workflow with an empty initial context.
	const result = await runtime.run(flow, {})

	console.log('Workflow Result:', result)
	// Expected Output:
	// {
	//   context: {
	//     initial_value: 42,
	//     doubled_value: 84,
	//     start: 42,
	//     double: 84
	//   },
	//   serializedContext: '{"initial_value":42,"doubled_value":84,"start":42,"double":84}',
	//   status: 'completed'
	// }
}

run()
```

This workflow can be visualized as:

<GettingStarted />

## Type Safety Benefits

This example demonstrates Flowcraft's strongly-typed context system:

- **Context Interface**: `SimpleWorkflowContext` defines the shape of your workflow's shared state
- **Type-safe Operations**: `context.get()` and `context.set()` provide compile-time type checking
- **IntelliSense Support**: Full autocomplete for context keys and their types
- **Runtime Safety**: Type mismatches are caught during development, not execution

## Using the DI Container

For better modularity and testability, you can use the Dependency Injection container with [`createDefaultContainer`](/api/container#createdefaultcontainer-options):

```typescript
import { ConsoleLogger, createDefaultContainer, createFlow, FlowRuntime } from 'flowcraft'

// ... (same flow definition as above)

// Set up the runtime with DI container
const container = createDefaultContainer({
  logger: new ConsoleLogger(),
  registry: flow.getFunctionRegistry(),
})

const runtime = new FlowRuntime(container)

// Run the workflow (same as before)
async function run() {
  const result = await runtime.run(flow, {})
  console.log('Workflow Result:', result)
}

run()
```

This approach centralizes configuration and makes it easy to swap implementations (e.g., for testing).

## Running the Example

Execute the file:
```bash
npx tsx simple-flow.ts
```

You should see the final workflow result logged to the console, showing that the `context` contains both the node outputs and your custom context values with full type safety.

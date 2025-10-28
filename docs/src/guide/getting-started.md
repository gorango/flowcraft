# Getting Started

This guide will walk you through installing Flowcraft and running your first strongly-typed workflow.

## Installation

Install Flowcraft into your project using your preferred package manager:

```bash
npm install flowcraft
```

## Your First Workflow

Let's create a simple workflow with three steps: one node to provide a starting number, a sleep node to pause for 1 second, and a final node to double the number, demonstrating Flowcraft's durable timers and strongly-typed context system.

```typescript
import { createFlow, FlowRuntime } from 'flowcraft'

// 1. Define your functions for the nodes
async function startNode({ context }: NodeContext) {
	const output = await context.get('value')
	return { output }
}
async function doubleNode({ input }: NodeContext) {
	return { output: input * 2 }
}

// 2. Define the workflow structure
const flow = createFlow('simple-workflow')
	.node('start', startNode)
	.sleep('pause', { duration: 1000 }) // Sleep for 1 second
	.node('double', doubleNode)
	.edge('start', 'pause')
	.edge('pause', 'double')

// 3. Initialize the runtime
const runtime = new FlowRuntime()

// 4. Run the workflow
async function run() {
	const blueprint = flow.toBlueprint()
	const result = await runtime.run(blueprint, { value: 42 })

	console.log('Workflow Result:', result)
	// Expected Output:
	// {
	//   "context": {
	//     "value": 42,
	//     "_outputs.start": 42,
	//     "_inputs.double": 42,
	//     "_outputs.double": 84
	//   },
	//   "serializedContext": "{\"value\":42,\"_outputs.start\":42,\"_inputs.double\":42,\"_outputs.double\":84}",
	//   "status": "completed"
	// }

run()
```

## Demo

This workflow can be visualized and run in the demo below:

<DemoGettingStarted />

## Compiler Alternative

For a more imperative approach, you can write the same workflow using the Flowcraft Compiler:

```typescript
/** @flow */
export async function simpleWorkflow(value: number) {
  const startResult = await startNode(value)
  const finalResult = await doubleNode(startResult)
  return finalResult
}

/** @step */
async function startNode(value: number) {
  return value
}

/** @step */
async function doubleNode(input: number) {
  return input * 2
}
```

This imperative code compiles to the same declarative blueprint as the Fluent API example above. The compiler provides an imperative developer experience while maintaining declarative runtime benefits.

[Learn more in the Compiler Guide >](/guide/compiler/)

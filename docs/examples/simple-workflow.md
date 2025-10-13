# Example: Simple Workflow

This example demonstrates a basic, linear workflow that could be used for a simple data transformation task. It showcases:
- Defining a workflow with `createFlow`.
- Passing data from one node to the next.
- Executing the workflow with `FlowRuntime`.

### The Goal

We want to create a workflow that:
1.  Fetches a user object.
2.  Extracts the user's name.
3.  Generates a greeting message.

### The Code

```typescript
import { ConsoleLogger, createFlow, FlowRuntime } from 'flowcraft'

// --- 1. Define the Node Logic ---

// Node to simulate fetching a user
async function fetchUser() {
	console.log('Fetching user...')
	return { output: { id: 1, name: 'Alice' } }
}

// Node to extract the user's name
async function extractName({ input }: { input: { name: string } }) {
	console.log('Extracting name...')
	return { output: input.name }
}

// Node to create a greeting
async function createGreeting({ input }: { input: string }) {
	console.log('Creating greeting...')
	return { output: `Hello, ${input}!` }
}

// --- 2. Define the Workflow ---

const flow = createFlow('greeting-workflow')
	.node('fetch-user', fetchUser)
	.node('extract-name', extractName)
	.node('create-greeting', createGreeting)
// Define the execution order
	.edge('fetch-user', 'extract-name')
	.edge('extract-name', 'create-greeting')
	.toBlueprint()

// --- 3. Run the Workflow ---

async function main() {
	const runtime = new FlowRuntime({
		logger: new ConsoleLogger(),
		registry: flow.getFunctionRegistry()
	})

	console.log('Starting workflow...')
	const result = await runtime.run(flow, {})

	console.log('\n--- Workflow Complete ---')
	console.log('Final Greeting:', result.context['create-greeting'])
	console.log('Final Context:', result.context)
}

main()
```

### Visualization

This linear workflow can be visualized as:

```mermaid
flowchart TD
	A["fetch-user"] --> B["extract-name"]
	B --> C["create-greeting"]
```

### Expected Output

When you run this code, you will see the logs from each node executing in sequence, followed by the final result.

```
Starting workflow...
[INFO] Starting workflow execution
Fetching user...
Extracting name...
Creating greeting...
[INFO] Workflow execution completed

--- Workflow Complete ---
Final Greeting: Hello, Alice!
Final Context: {
	'fetch-user': { id: 1, name: 'Alice' },
	'extract-name': 'Alice',
	'create-greeting': 'Hello, Alice!'
}
```
This example forms the foundation for building more complex and dynamic workflows with Flowcraft.

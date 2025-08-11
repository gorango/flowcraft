# Getting Started: Your First Workflow

This tutorial is the fastest way to get hands-on with Flowcraft. We will build a simple, three-step pipeline that takes a name as input, constructs a greeting, and assembles a final message. By the end, you'll have a running workflow and a practical understanding of Flowcraft's core concepts.

## Prerequisites

- [Node.js](https://nodejs.org/) installed on your system.
- A package manager like `npm` or `pnpm`.
- A way to run TypeScript files like `tsx` or `bun`.

## Step 1: Project Setup

In your project directory, install Flowcraft. We'll use `tsx` to run our TypeScript file directly without a separate build step.

```bash
# Create a new directory for your project
mkdir flowcraft-tutorial
cd flowcraft-tutorial

# Install Flowcraft and tsx
npm install flowcraft
npm install -D tsx
```

## Step 2: Define the Workflow Logic

Create a new file named `main.ts`. This is where we'll define and run our workflow.

```bash
touch main.ts
```

Inside `main.ts`, we'll start by importing the core components we need from Flowcraft and defining the `ContextKey`s that will hold our state.

```typescript
// main.ts
import { contextKey, Flow, Node, TypedContext } from 'flowcraft'

// Define type-safe keys for our shared data
const NAME = contextKey<string>('name')
const GREETING = contextKey<string>('greeting')
const FINAL_MESSAGE = contextKey<string>('final_message')

// 1. nameNode: Takes a name from input `params` and stores it in the Context.
const nameNode = new Node()
	.exec(async ({ params }) => params.name)
	.toContext(NAME)

// 2. greetingNode: Reads the name from the Context, creates a greeting, and stores it back.
const greetingNode = new Node()
	.exec(async ({ ctx }) => `Hello, ${await ctx.get(NAME)}!`)
	.toContext(GREETING)

// 3. finalNode: Reads the greeting from the Context and assembles the final message.
const finalNode = new Node()
	.exec(async ({ ctx }) => `${await ctx.get(GREETING)} Welcome to Flowcraft!`)
	.toContext(FINAL_MESSAGE)
```

## Step 3: Orchestrate and Run the `Flow`

Now that we have our nodes, we need to wire them together into a sequence and create a `Flow` to run them.

```typescript
// main.ts (continued)

// Chain the nodes to define the execution order.
nameNode.next(greetingNode).next(finalNode)

// Create a Flow, telling it which node to start with.
const flow = new Flow(nameNode)

// Execute the flow.
async function main() {
	// The Context is the shared memory for our workflow.
	const context = new TypedContext()

	console.log('Starting workflow...')
	// We pass static input via `.withParams()` and run the flow.
	await flow.withParams({ name: 'Developer' }).run(context)

	// After the flow is done, we can inspect the final state of the context.
	const result = await context.get(FINAL_MESSAGE)
	console.log('Workflow complete!')
	console.log(`Final Result: "${result}"`)
}

main()
```

## Step 4: Run It

Your `main.ts` file should now contain the complete workflow. Run it from your terminal using `tsx`.

```bash
npx tsx main.ts
```

You should see the following output:

```
Starting workflow...
Workflow complete!
Final Result: "Hello, Developer! Welcome to Flowcraft!"
```

Congratulations! You've just built and run your first Flowcraft workflow. You've seen how to create nodes, manage state with a `Context`, and orchestrate a sequence with a `Flow`.

## Next Steps

Now that you have a solid foundation, you can start exploring the two main ways to build workflows:

- **[Building Programmatic Workflows](./programmatic/basics.md)**: Learn more about the class-based and functional APIs for building workflows in code.
- **[Building Declarative Workflows](./declarative/basics.md)**: Discover how to build dynamic workflows from JSON definitions using the powerful `GraphBuilder`.

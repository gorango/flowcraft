# Getting Started with Cascade

This guide will walk you through creating your first workflow. We will build a simple, three-step pipeline that takes a name as input, constructs a greeting, and assembles a final message. By the end, you'll understand how to define nodes, manage state with a `Context`, and orchestrate a `Flow`.

## Prerequisites

- [Node.js](https://nodejs.org/) installed on your system.
- A package manager like `npm` or `pnpm`.

## Step 1: Project Setup

First, let's set up a new project directory.

```bash
mkdir my-cascade-project
cd my-cascade-project
npm init -y
```

Now, install Cascade and the necessary TypeScript tools. We'll use `tsx` to run our TypeScript file directly.

```bash
npm install gorango/cascade
npm install typescript tsx --save-dev
```

Finally, create a `tsconfig.json` file to configure TypeScript:

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true
  }
}
```

## Step 2: Create Your Workflow File

Create a new file named `main.ts`. This is where we'll define and run our workflow.

```bash
touch main.ts
```

## Step 3: Define the Workflow Logic

Inside `main.ts`, we'll start by importing the core components we need from Cascade.

```typescript
// main.ts
import { Node, Flow, TypedContext, contextKey } from 'cascade'
```

### The `Context` and `ContextKey`

A workflow needs a way to pass data between steps. The `Context` is a shared, `Map`-like object that serves this purpose. To ensure type safety, we define `ContextKey`s for each piece of data we want to store.

```typescript
// Define type-safe keys for our shared data
const NAME = contextKey<string>('name')
const GREETING = contextKey<string>('greeting')
const FINAL_MESSAGE = contextKey<string>('final_message')
```

### The `Node`

A `Node` represents a single unit of work. We'll use the fluent, chainable API on the `Node` class to define our steps without creating a new class for each one.

1. **`nameNode`**: This node will take a name from its input `params`, and its job is to store that name in the `Context`.

    ```typescript
    // This node's logic is to execute and return the 'name' parameter.
    // .toContext(NAME) chains a post-execution step to store the result
    // in the context under the NAME key.
    const nameNode = new Node()
        .exec(async ({ params }) => params.name)
        .toContext(NAME)
    ```

2. **`greetingNode`**: This node will read the name from the `Context`, create a greeting string, and store it back in the `Context`.

    ```typescript
    // This node reads from the context in its `exec` phase,
    // constructs a new string, and then stores it.
    const greetingNode = new Node()
        .exec(async ({ ctx }) => `Hello, ${ctx.get(NAME)}!`)
        .toContext(GREETING)
    ```

3. **`finalNode`**: This final node will read the greeting from the `Context`, assemble the final message, and store it.

    ```typescript
    // The final step combines the previous result into a complete message.
    const finalNode = new Node()
        .exec(async ({ ctx }) => `${ctx.get(GREETING)} Welcome to Cascade!`)
        .toContext(FINAL_MESSAGE)
    ```

## Step 4: Orchestrate and Run the `Flow`

Now that we have our nodes, we need to wire them together into a sequence and run them.

1. **Chain the Nodes**: We use the `.next()` method to define the execution order. `nameNode` runs first, then `greetingNode`, then `finalNode`.

    ```typescript
    nameNode.next(greetingNode).next(finalNode)
    ```

2. **Create the Flow**: A `Flow` is a special `Node` that orchestrates other nodes. We create one, telling it which node to start with.

    ```typescript
    const flow = new Flow(nameNode)
    ```

3. **Execute the Flow**: We create an empty `TypedContext` and call `flow.run()`. We use `.withParams()` on the flow to pass the initial input data (`name: 'Developer'`).

    ```typescript
    async function main() {
        // The context starts empty.
        const context = new TypedContext()

        console.log('Starting workflow...')

        // Run the flow, passing initial parameters.
        await flow.withParams({ name: 'Developer' }).run(context)

        // After the flow completes, inspect the context for the final result.
        const result = context.get(FINAL_MESSAGE)
        console.log('Workflow complete!')
        console.log(`Final Result: "${result}"`)
    }

    main()
    ```

## Step 5: Run It

Your `main.ts` file should now contain the complete workflow. Run it from your terminal:

```bash
npx tsx main.ts
```

You should see the following output:

```
Starting workflow...
Workflow complete!
Final Result: "Hello, Developer! Welcome to Cascade!"
```

Congratulations! You've successfully built and run your first Cascade workflow.

## Next Steps

Now that you have a basic understanding, you can dive deeper into the framework's architecture:

- **[Core Concepts](./core-concepts.md)**: Learn more about the `Node` lifecycle, `Flow` orchestration, and `Context` management.

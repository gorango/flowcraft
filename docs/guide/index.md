# Introduction to Flowcraft

Welcome to Flowcraft! This guide will take you from the fundamental concepts to building your first workflow, giving you a comprehensive understanding of what Flowcraft is, why it's useful, and how it works.

## What is Flowcraft?

Flowcraft is a lightweight, zero-dependency TypeScript framework for building complex, multi-step processes. It empowers you to model everything from simple sequential tasks to dynamic, graph-driven AI agents with a clear and composable API.

At its core, Flowcraft is guided by a few key principles:

1. **Structure for Complexity**: It provides a clear way to model asynchronous processes. By breaking logic into discrete `Node`s with a defined lifecycle, you can turn tangled promise chains and `async/await` blocks into maintainable, testable graphs.
2. **Start Simple, Scale Gracefully**: You can start with an in-memory workflow in a single file. As your needs grow, the architecture allows you to scale up to a robust, distributed system using message queues—**without changing your core business logic**.
3. **Composability is Key**: A `Flow` is just a specialized `Node`. This simple but powerful concept means entire workflows can be treated as building blocks, allowing you to create highly modular and reusable systems.

The best way to see the power of this structure is to build something.

## Quick Start: Your First Workflow

This tutorial will walk you through creating a simple, three-step pipeline that takes a name as input, constructs a greeting, and assembles a final message.

### Prerequisites

- [Node.js](https://nodejs.org/) installed on your system.
- A package manager like `npm` or `pnpm`.
- A way to run TypeScript files like `tsx` or `bun`.

### Step 1: Project Setup

In your project directory, install Flowcraft and the necessary TypeScript tools. We'll use `tsx` to run our TypeScript file directly.

```bash
npm install flowcraft
```

### Step 2: Define the Workflow Logic

Create a new file named `main.ts`. This is where we'll define and run our workflow.

```bash
touch main.ts
```

Inside `main.ts`, we'll start by importing the core components we need from Flowcraft.

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

### Step 3: Orchestrate and Run the `Flow`

Now that we have our nodes, we need to wire them together into a sequence and run them.

```typescript
// main.ts (continued)

// Chain the nodes to define the execution order.
nameNode.next(greetingNode).next(finalNode)

// Create a Flow, telling it which node to start with.
const flow = new Flow(nameNode)

// Execute the flow.
async function main() {
	const context = new TypedContext()

	console.log('Starting workflow...')
	await flow.withParams({ name: 'Developer' }).run(context)

	const result = await context.get(FINAL_MESSAGE)
	console.log('Workflow complete!')
	console.log(`Final Result: "${result}"`)
}

main()
```

### Step 4: Run It

Your `main.ts` file should now contain the complete workflow. Run it from your terminal:

```bash
npx tsx main.ts
```

You should see the following output:

```
Starting workflow...
Workflow complete!
Final Result: "Hello, Developer! Welcome to Flowcraft!"
```

Congratulations! You've just built and run a Flowcraft workflow. Now, let's break down the concepts you just used.

---

## Core Concepts

Flowcraft is built around a few simple, powerful concepts.

### 1. Node

The `Node` is the most fundamental building block, representing a single unit of work. In our Quick Start, `nameNode`, `greetingNode`, and `finalNode` were all created from the base `Node` class.

Every `Node` has a well-defined, three-phase lifecycle:

1. **`prep(args)`**: **Prepare Data**. Gathers data needed for execution, usually by reading from the `Context`.
2. **`exec(args)`**: **Execute Core Logic**. Performs the main work. This phase is designed to be isolated from the `Context` to make it pure and testable.
3. **`post(args)`**: **Process Results**. Updates the `Context` with the results and returns an **action** to determine the next step.

For many common tasks, like in our example, you can use the fluent API (`.map`, `.toContext`, `.filter`) to create processing pipelines without writing a custom class.

> [!TIP]
> **Simplified Node Classes**
>
> For common patterns, you can extend simplified base classes to reduce boilerplate. Use `ExecNode` for core logic, `PreNode` for context-only changes, or `PostNode` for branching decisions. See the [Core API Reference](/api-reference/workflow.md#simplified-base-classes) for details.

### 2. Flow

A `Flow` is a special `Node` that acts as a **container for a graph of other nodes**. It holds the starting point of a workflow and orchestrates the execution.

When you call `flow.run()`, an `Executor` starts with the flow's `startNode`, executes it, looks at the **action** it returns, and finds the next node connected via `.next()`. This repeats until the flow ends.

### 3. Context

The `Context` is the shared memory of a running workflow. It is passed to every node, allowing them to share state. In our example, we used it to pass the `name` from `nameNode` to `greetingNode`, and the `greeting` on to `finalNode`.

- **Type-Safe by Default**: We used `contextKey<string>('name')` to create a type-safe key. This prevents you from accidentally writing a number where a string is expected.
- **Mutable**: Nodes read from the context (usually in `prep` or `exec`) and write back to it (usually in `post` or via `.toContext`).

### 4. Actions & Branching

An **action** is a string returned by a node's `post()` method that the `Executor` uses to decide which path to take next.

- **`DEFAULT_ACTION`**: Used for simple linear sequences. `nodeA.next(nodeB)` is shorthand for branching on the default action.
- **Custom Actions**: Returning a custom string like `'success'` or `'error'` from `post()` enables conditional branching, allowing you to direct the workflow down different paths based on a node's outcome.

---

## When to Use Flowcraft

Flowcraft is an excellent choice for:

- **AI Agent Orchestration**: Modeling the "reasoning loop" of an AI agent is a natural fit for a graph. Conditional branching, tool use, and parallel thought processes are easily implemented. The **[Advanced RAG Agent](https://github.com/gorango/flowcraft/tree/master/sandbox/6.rag/)** is a complete, end-to-end example of this pattern.
- **Data Processing & ETL Pipelines**: Fetching data, running transformations, and saving it to a destination. The [Parallel Batch Translation](https://github.com/gorango/flowcraft/tree/master/sandbox/3.parallel/) is a great example of this task.
- **Complex Business Logic**: Any multi-step process with conditional paths, retries, and fallbacks (e.g., user onboarding, e-commerce order fulfillment). Look at some of the examples in the [DAG](https://github.com/gorango/flowcraft/tree/master/sandbox/4.dag/) sandbox.
- **Multi-Step Background Jobs**: Running tasks in the background of a web application, like generating a report or processing a file. The [Distributed](https://github.com/gorango/flowcraft/tree/master/sandbox/5.distributed/) examples showcase running all of the same DAG workflows but in the background.

## How Flowcraft Compares

- **vs. Plain `async/await`**: Use `async/await` for simple, linear sequences. Use Flowcraft when your process starts to look like a state machine or a graph, with retries, fallbacks, or complex conditional logic.
- **vs. LangChain / LlamaIndex**: Use those frameworks for rapid prototyping with their vast ecosystem of pre-built integrations. Use Flowcraft when you want an unopinionated **runtime** for your custom AI logic, giving you full control over your prompts and business logic.
- **vs. Temporal / Airflow**: Use these heavy-duty platforms when you need **durability** (guaranteed execution that survives server crashes) out of the box. Use Flowcraft when you want to start with a lightweight, in-process library and have the *option* to build a distributed system later.

## Next Steps

Now that you have a solid foundation, you can explore more advanced topics:

- **[Builders](./builders.md)**: Learn about creating sequential, parallel, and declarative graph-based flows.
- **[Functional API](./functional-api.md)**: Discover a more functional style of defining nodes and pipelines.
- **[Recipes](./recipes/)**: Find practical, copy-paste-friendly solutions for common workflow patterns.
- **[Advanced Guides](./advanced-guides/composition.md)**: Dive into composition, middleware, custom executors, and more.

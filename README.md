# Workflow

A flexible and lightweight workflow framework for Node.js and TypeScript. Build complex, multi-step processes with support for branching, composition, retries, and seamless asynchronous execution.

## Features

- **Declarative & Composable**: Define workflows by chaining nodes. Entire flows can be nested and used as single nodes in other flows.
- **State Management**: A shared `Context` map is passed through the workflow, allowing nodes to share data and state.
- **Conditional Branching**: Direct the flow's execution path based on the results of a node.
- **Async-First by Default**: Built on an asynchronous foundation to seamlessly handle both I/O-bound (e.g., API calls, file I/O) and CPU-bound tasks. Synchronous-style nodes work out-of-the-box without boilerplate.
- **Retry Logic & Fallbacks**: Automatically retry failed operations with configurable delays and define fallback logic if all retries are exhausted.
- - **Cancellation Support**: Gracefully abort running workflows using standard `AbortController`s.
- **Batch Processing**: Built-in support for processing collections of items sequentially (`BatchFlow`) or in parallel (`ParallelBatchFlow`).
- **Type-Safe**: Written in TypeScript to provide strong typing for your workflow definitions.

## Installation

```bash
npm install https://github.com/gorango/workflow
```

## Core Concepts

### Node

The `Node` is the fundamental building block of a workflow. It represents a single, potentially asynchronous unit of work. Each node has a three-phase lifecycle, and all methods are `async` by default.

1. `prep(args)`: Prepare data for execution. This is where you might fetch data from the `Context`.
2. `exec(args)`: Perform the core logic of the node. This phase is isolated from the context.
3. `post(args)`: Process the results of `exec()` and update the `Context`. This method returns an "action" string that determines the next step in the flow.

All lifecycle methods receive a single argument object, allowing you to destructure only what you need (e.g., `{ ctx, params, prepRes, execRes }`).

### Flow

A `Flow` is a special type of node that orchestrates a sequence of other nodes. You define a starting node and chain subsequent nodes together. The flow executes nodes one by one, following the execution path determined by the actions returned from each node's `post()` method.

### Context

The `Context` is a `Map` instance that is passed through every node in a flow. It acts as a shared memory space, allowing nodes to pass data, share state, and communicate with each other.

### Actions & Branching

A node's `post()` method can return a string, called an **action**. When a flow runs a node, it uses this action to look up the next node to execute. By default, the action is `'default'`, but you can return custom strings to implement conditional branching.

```typescript
// After this node runs, the flow will look for a successor linked to the 'positive' action.
checkNode.next(addIfPositive, 'positive')

// If the number is negative, this path is taken.
checkNode.next(addIfNegative, 'negative')
```

### Aborting Workflows

All run methods accept an optional AbortController instance. Calling controller.abort() will cause the workflow to halt at the next available step and reject the run promise with an AbortError. This is essential for managing timeouts or handling user cancellation.

```typescript
import { AbortError, Flow, Node } from 'workflow'

const flow = new Flow(new SomeLongRunningNode())
const controller = new AbortController()
const context = new Map()

// Abort the flow after 2 seconds
setTimeout(() => controller.abort(), 2000)

try {
 await flow.run(context, controller)
}
catch (e) {
 if (e instanceof AbortError) {
  console.log('Workflow was aborted as expected.')
 }
}
```

## Examples & Recipes

The best way to understand workflow is to see it in action. Instead of simple snippets, this repository includes comprehensive examples and a full test suite that demonstrate various features.

### Unit Tests ([`src/workflow.test.ts`](/recipes/))

For clear, focused examples of specific features, check out the unit tests. You will find test cases covering:

- Basic sequential flows
- Conditional branching
- Nested flows (composition)
- Retry logic and fallbacks
- Sequential and parallel batch processing
- Cancellation

## API Reference

### Core Classes

- `Node`: The base class for a potentially asynchronous unit of work with built-in retry logic.
- `Flow`: Orchestrates a sequence of nodes, handling both synchronous and asynchronous operations seamlessly.

### Batch Flows

- `BatchFlow`: A flow that executes its entire workflow sequentially for each item in a list. The operations within can still be async.
- `ParallelBatchFlow`: A flow that executes its entire workflow in parallel for each item in a list.

# Cascade: A Workflow Framework

Build complex, multi-step processes with support for branching, composition, and retries.

## Features

- **Declarative & Composable**: Define workflows by chaining nodes. Entire flows can be nested and used as single nodes in other flows.
- **State Management**: A shared `Context` map is passed through the workflow, allowing nodes to share data and state.
- **Conditional Branching**: Direct the flow's execution path based on the results of a node.
- **Async-First by Default**: Built on an asynchronous foundation to seamlessly handle both I/O-bound (e.g., API calls, file I/O) and CPU-bound tasks. Synchronous-style nodes work out-of-the-box without boilerplate.
- **Retry Logic & Fallbacks**: Automatically retry failed operations with configurable delays and define fallback logic if all retries are exhausted.
- **Type-Safe**: Written in TypeScript to provide strong typing for your workflow definitions.

## Installation

```bash
npm install workflow
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

## Usage Examples

### 1. Basic Sequential Flow

Here's how to create a simple sequential pipeline that performs a calculation. Even though the framework is async, purely synchronous logic works intuitively.

```typescript
import { Context, Flow, Node, NodeArgs } from 'workflow'

// A node to set the initial number
class NumberNode extends Node {
  constructor(private number: number) { super() }
  async prep({ ctx }: NodeArgs) {
    ctx.set('current', this.number)
  }
}

// A node to add to the current number
class AddNode extends Node {
  constructor(private number: number) { super() }
  async prep({ ctx }: NodeArgs) {
    ctx.set('current', ctx.get('current') + this.number)
  }
}

const flow = new Flow()
flow
  .start(new NumberNode(5))
  .next(new AddNode(10))
  .next(new AddNode(3))

const context = new Map()
await flow.run(context)

console.log(context.get('current')) // Output: 18
```

### 2. Conditional Branching

Workflows can take different paths based on a node's result.

```typescript
import { Context, DEFAULT_ACTION, Flow, Node, NodeArgs } from 'workflow'

// This node checks a number and returns a custom action
class CheckPositiveNode extends Node<void, void, string> {
  async post({ ctx }: NodeArgs): Promise<string> {
    return ctx.get('current') >= 0 ? 'positive' : 'negative'
  }
}

class PathNode extends Node {
  constructor(private pathId: string) { super() }
  async prep({ ctx }: NodeArgs) {
    ctx.set('path_taken', this.pathId)
  }
}

const startNode = new NumberNode(-5) // Using NumberNode from previous example
const checkNode = new CheckPositiveNode()
const positivePathNode = new PathNode('A')
const negativePathNode = new PathNode('B')

const flow = new Flow(startNode)
startNode.next(checkNode)
checkNode.next(positivePathNode, 'positive') // Branch for 'positive' action
checkNode.next(negativePathNode, 'negative') // Branch for 'negative' action

const context = new Map()
await flow.run(context)

console.log(context.get('path_taken')) // Output: 'B'
```

### 3. Asynchronous Operations with Retries

Use `Node` and `Flow` for all tasks, including I/O-bound operations. This example shows an async operation with the built-in retry mechanism.

```typescript
import { Context, Flow, Node, NodeArgs } from 'workflow'

let apiShouldFail = true

// A node that simulates a flaky API call
class ApiCallNode extends Node<void, string> {
  constructor() {
    // Retry up to 3 times, waiting 50ms between retries
    super(3, 50)
  }

  async exec(): Promise<string> {
    console.log(`Attempt #${this.curRetry + 1}...`)
    if (apiShouldFail) {
      apiShouldFail = false // Let it succeed on the second attempt
      throw new Error('API unavailable')
    }
    await new Promise(res => setTimeout(res, 20)) // Simulate network latency
    return 'Success'
  }

  // This runs if all retries fail
  async execFallback(): Promise<string> {
    return 'Fallback'
  }

  async post({ ctx, execRes }: NodeArgs<void, string>) {
    ctx.set('result', execRes)
  }
}

const flow = new Flow(new ApiCallNode())
const context = new Map()

await flow.run(context)
// Output:
// Attempt #1...
// Attempt #2...

console.log(context.get('result')) // Output: 'Success'
```

## API Reference

### Core Classes

- `Node`: The base class for a potentially asynchronous unit of work with built-in retry logic.
- `Flow`: Orchestrates a sequence of nodes, handling both synchronous and asynchronous operations seamlessly.

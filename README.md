# Workflow

A flexible and lightweight workflow framework for Node.js and TypeScript. Build complex, multi-step processes with support for branching, composition, retries, and both synchronous and asynchronous execution.

## Features

- **Declarative & Composable**: Define workflows by chaining nodes. Entire flows can be nested and used as single nodes in other flows.
- **State Management**: A shared `Context` map is passed through the workflow, allowing nodes to share data and state.
- **Conditional Branching**: Direct the flow's execution path based on the results of a node.
- **Sync & Async Support**: First-class support for both synchronous and asynchronous operations with `Node`/`Flow` and `AsyncNode`/`AsyncFlow` classes.
- **Retry Logic & Fallbacks**: Automatically retry failed operations with configurable delays and define fallback logic if all retries are exhausted.
- **Batch Processing**: Built-in support for processing collections of items sequentially (`BatchFlow`) or in parallel (`AsyncParallelBatchFlow`).
- **Type-Safe**: Written in TypeScript to provide strong typing for your workflow definitions.

## Installation

```bash
npm install workflow
```

## Core Concepts

### Node

The `Node` is the fundamental building block of a workflow. It represents a single unit of work. Each node has a three-phase lifecycle:

1. `prep()`: Prepare data for execution. This is where you might fetch data from the `Context`.
2. `exec()`: Perform the core logic of the node. This phase is isolated from the context.
3. `post()`: Process the results of `exec()` and update the `Context`. This method returns an "action" string that determines the next step in the flow.

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

### 1. Basic Synchronous Flow

Here's how to create a simple sequential pipeline that performs a calculation.

```typescript
import { Node, Flow, Context } from 'workflow'

// A node to set the initial number
class NumberNode extends Node {
  constructor(private number: number) { super() }
  prep(ctx: Context) {
    ctx.set('current', this.number)
  }
}

// A node to add to the current number
class AddNode extends Node {
  constructor(private number: number) { super() }
  prep(ctx: Context) {
    ctx.set('current', ctx.get('current') + this.number)
  }
}

const flow = new Flow()
flow
  .start(new NumberNode(5))
  .next(new AddNode(10))
  .next(new AddNode(3))

const context = new Map()
flow.run(context)

console.log(context.get('current')) // Output: 18
```

### 2. Conditional Branching

Workflows can take different paths based on a node's result.

```typescript
import { Node, Flow, Context, Params, DEFAULT_ACTION } from 'workflow'

// This node checks a number and returns a custom action
class CheckPositiveNode extends Node<void, void, string> {
  post(ctx: Context): string {
    return ctx.get('current') >= 0 ? 'positive' : 'negative'
  }
}

class PathNode extends Node {
  constructor(private pathId: string) { super() }
  prep(ctx: Context) {
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
flow.run(context)

console.log(context.get('path_taken')) // Output: 'B'
```

### 3. Asynchronous Flow with Retries

Use `AsyncNode` and `AsyncFlow` for I/O-bound or other asynchronous tasks. This example also shows the built-in retry mechanism.

```typescript
import { AsyncNode, AsyncFlow, Context } from 'workflow'

let apiShouldFail = true

// A node that simulates a flaky API call
class ApiCallNode extends AsyncNode<void, string> {
  constructor() {
    // Retry up to 3 times, waiting 50ms between retries
    super(3, 50)
  }

  async execAsync(): Promise<string> {
    console.log(`Attempt #${this.curRetry + 1}...`)
    if (apiShouldFail) {
      apiShouldFail = false // Let it succeed on the second attempt
      throw new Error('API unavailable')
    }
    return 'Success'
  }

  // This runs if all retries fail
  async execFallbackAsync(): Promise<string> {
    return 'Fallback'
  }

  async postAsync(ctx: Context, _, execRes: string) {
    ctx.set('result', execRes)
  }
}

const flow = new AsyncFlow(new ApiCallNode())
const context = new Map()

await flow.runAsync(context)
// Output:
// Attempt #1...
// Attempt #2...

console.log(context.get('result')) // Output: 'Success'
```

### 4. Parallel Batch Processing

The `AsyncParallelBatchFlow` is perfect for "map-reduce" style operations where you want to process a list of items concurrently.

```typescript
import { AsyncParallelBatchFlow, AsyncNode, Context, Params } from 'workflow'

// Define the node that will process each item
class DataProcessNode extends AsyncNode {
  async prepAsync(ctx: Context, params: Params) {
    // Simulate some async work for each item
    await new Promise(res => setTimeout(res, 10))
    const data = ctx.get('input_data')[params.key]
    ctx.get('results')[params.key] = data * params.multiplier
  }
}

// Define a flow that prepares the batch of items
class ProcessItemsFlow extends AsyncParallelBatchFlow {
  async prepAsync() {
    // This array of params will be processed in parallel
    return [
      { key: 'a', multiplier: 2 },
      { key: 'b', multiplier: 3 },
      { key: 'c', multiplier: 4 },
    ]
  }
}

const context = new Map([
  ['input_data', { a: 1, b: 2, c: 3 }],
  ['results', {}],
])

const flow = new ProcessItemsFlow(new DataProcessNode())
await flow.runAsync(context)

console.log(context.get('results')) // Output: { a: 2, b: 6, c: 12 }
```

## API Reference

### Core Classes

- `Node`: The base class for a synchronous unit of work with retry logic.
- `AsyncNode`: The base class for an asynchronous unit of work with retry logic.
- `Flow`: Orchestrates a sequence of synchronous nodes.
- `AsyncFlow`: Orchestrates a sequence of synchronous and/or asynchronous nodes.

### Batch Flows

- `BatchFlow`: A synchronous flow that executes its entire workflow for each item in a list sequentially.
- `AsyncBatchFlow`: An asynchronous flow that executes its entire workflow for each item in a list sequentially.
- `AsyncParallelBatchFlow`: An asynchronous flow that executes its entire workflow for each item in a list in parallel.

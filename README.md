# Workflow

A flexible and lightweight workflow framework for Node.js and TypeScript. Build complex, multi-step processes with support for branching, composition, retries, and seamless asynchronous execution.

## Features

- **Declarative & Composable**: Define workflows by chaining nodes. Entire flows can be nested and used as single nodes in other flows.
- **Type-Safe State Management**: A shared, type-safe `Context` object is passed through the workflow, allowing nodes to share data and state.
- **Conditional Branching**: Direct the flow's execution path based on the results of a node.
- **Async by Default**: Built on an asynchronous foundation to seamlessly handle both I/O-bound (e.g., API calls, file I/O) and CPU-bound tasks. Synchronous-style nodes work out-of-the-box without boilerplate.
- **Pluggable Logging**: Observe and debug workflows with a standard `Logger` interface. A default console logger is provided, or you can use your own (e.g., Pino, Winston).
- **Cancellation Support**: Gracefully abort running workflows using standard `AbortController`s.
- **Retry Logic & Fallbacks**: Automatically retry failed operations with configurable delays and define fallback logic if all retries are exhausted.
- **Batch Processing**: Built-in support for processing collections of items sequentially (`BatchFlow`) or in parallel (`ParallelBatchFlow`).
- **Type-Safe**: Written in TypeScript to provide strong typing for your workflow definitions and context.

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

The `Context` is an object that implements the `WorkflowContext` interface, passed through every node in a flow. It acts as a shared memory space, allowing nodes to pass data, share state, and communicate with each other in a type-safe manner. You typically instantiate it using the provided `TypedContext` class.

### Actions & Branching

A node's `post()` method can return a string, called an **action**. When a flow runs a node, it uses this action to look up the next node to execute. By default, the action is `'default'`, but you can return custom strings to implement conditional branching.

### Aborting Workflows

All run methods accept an optional `AbortController` instance. Calling `controller.abort()` will cause the workflow to halt at the next available step and reject the run promise with an `AbortError`. This is essential for managing timeouts or handling user cancellation.

### Logging

You can supply your own logger to the `run` method to gain insight into the workflow's execution. The logger must conform to a simple `Logger` interface. The injected logger is also available inside every node via `args.logger`.

## Putting It All Together: An Example

This example demonstrates several features: a main flow orchestrating a sub-flow, conditional branching, and retry logic.

```typescript
import { TypedContext, Flow, Node, DEFAULT_ACTION } from './workflow';

// A node that might fail, with retry logic
class FetchUserDataNode extends Node<void, { id: number; name: string }> {
  constructor() {
    // Retry up to 3 times on failure
    super(3);
  }
  async exec({ params }: { params: { userId: number } }): Promise<{ id: number; name: string }> {
    console.log(`Fetching data for user ${params.userId}...`);
    // In a real app, this would be an API call
    if (Math.random() > 0.3) { // Simulate a network failure
      throw new Error('Network error');
    }
    return { id: params.userId, name: `User ${params.userId}` };
  }
  async execFallback() {
    // If all retries fail, return a default object
    return { id: -1, name: 'Unknown User' };
  }
  async post({ ctx, execRes }: { ctx: TypedContext, execRes: any }) {
    ctx.set('userData', execRes);
  }
}

// A node to decide the next step based on user data
class TriageUserNode extends Node<void, void, 'premium' | 'regular' | 'unknown'> {
  async post({ ctx }: { ctx: TypedContext }): Promise<'premium' | 'regular' | 'unknown'> {
    const userData = ctx.get<{ id: number, name: string }>('userData');
    if (userData.id === -1) return 'unknown';
    // Logic to determine user type
    return userData.id === 1 ? 'premium' : 'regular';
  }
}

// A simple node to log a message
class LogMessageNode extends Node {
    constructor(private message: string) { super(); }
    async prep() { console.log(this.message); }
}

// Create a sub-flow for processing a user
const userProcessingFlow = Flow.sequence(
    new FetchUserDataNode(),
    new TriageUserNode()
);

// Create the main workflow
const mainFlow = new Flow(userProcessingFlow);
const premiumPath = new LogMessageNode('Processing premium user...');
const regularPath = new LogMessageNode('Processing regular user...');
const unknownPath = new LogMessageNode('Handling unknown user...');

// Define the branches
userProcessingFlow.next(premiumPath, 'premium');
userProcessingFlow.next(regularPath, 'regular');
userProcessingFlow.next(unknownPath, 'unknown');

// Run the workflow for a specific user
const context = new TypedContext();
mainFlow.withParams({ userId: 1 }); // Set params for the whole flow

await mainFlow.run(context);
// Output will depend on the simulated network conditions, but it will
// eventually log one of the three messages after retries.
```

## Examples & Recipes

The best way to understand `workflow` is to see it in action. For clear, focused examples of specific features, check out the unit tests. You will find test cases covering:

- Basic sequential flows
- Conditional branching
- Nested flows (composition)
- Retry logic and fallbacks
- Sequential and parallel batch processing
- Cancellation

See the tests here: [`src/workflow.test.ts`](src/workflow.test.ts)

## API Reference

### Core Classes

- `Node`: The base class for a potentially asynchronous unit of work with built-in retry logic.
- `Flow`: Orchestrates a sequence of nodes, handling both synchronous and asynchronous operations seamlessly. Provides a `Flow.sequence(...)` helper for creating linear flows.
- `TypedContext`: The standard implementation for the `WorkflowContext` interface, used for shared state.

### Batch Flows

- `BatchFlow`: A flow that executes its entire workflow sequentially for each item in a list.
- `ParallelBatchFlow`: A flow that executes its entire workflow in parallel for each item in a list.

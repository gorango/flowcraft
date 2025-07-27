# Building a Custom Executor

The `IExecutor` pattern is one of Flowcraft's most powerful architectural features. It decouples the definition of a workflow (the graph of `Node`s) from its execution environment. While the default `InMemoryExecutor` is perfect for many use cases, you can create your own executors to run workflows in different environments, such as a distributed task queue, a test environment, or even a system that requires pausing and resuming.

This guide will walk you through the responsibilities of an executor and show you how to build a simple `DryRunExecutor` from scratch.

## The `IExecutor` Interface

At its core, an executor is any class that implements the `IExecutor` interface. The interface is intentionally simple:

```typescript
interface IExecutor {
	run: (flow: Flow, context: Context, options?: RunOptions) => Promise<any>
}
```

The `run` method is the main entry point. When you call `flow.run(ctx, { executor: myExecutor })`, your executor's `run` method is invoked.

## Core Responsibilities of an Executor

An executor is responsible for the entire orchestration of a `Flow`. This involves several key tasks:

1. **The `run` Entry Point**: This public method kicks off the workflow. It's responsible for setting up the initial state and starting the execution loop.
2. **The Execution Loop**: It must traverse the workflow graph, executing one node at a time. This typically involves a `while` loop that continues as long as there is a `currentNode` to process.
3. **Applying Middleware**: Before executing a node, it must apply any middleware that has been attached to the `Flow`.
4. **Passing Arguments**: It is responsible for constructing the `NodeArgs` object and passing the correct `ctx`, `params`, `signal`, `logger`, and a reference to *itself* down to the `node._run()` method (or a middleware chain).
5. **Handling Actions & Branching**: After a node runs, the executor must take the returned `action`, look up the correct successor node in `currentNode.successors`, and determine the next node to execute.
6. **State Management (for distributed systems)**: If the executor runs across different processes, it is responsible for serializing the `Context` before passing it to the next job and deserializing it upon receipt.

## Step-by-Step Example: Building a `DryRunExecutor`

To understand these responsibilities in practice, let's build a `DryRunExecutor`. This executor will traverse an entire workflow graph and log the path it would take, but it will **not** execute the core `exec()` logic of any node. This is a great tool for debugging the structure and conditional logic of a complex flow.

### 1. The Class Structure

First, create the class and implement the `IExecutor` interface.

```typescript
// src/executors/dry-run-executor.ts
import {
	AbstractNode,
	Context,
	DEFAULT_ACTION,
	Flow,
	IExecutor,
	Logger,
	NullLogger,
	RunOptions
} from 'flowcraft'

export class DryRunExecutor implements IExecutor {
	public async run(flow: Flow, context: Context, options?: RunOptions): Promise<any> {
		// Implementation will go here
	}
}
```

### 2. The `run` Method and Orchestration Loop

The `run` method will prepare the logger and initial parameters and then enter the main orchestration loop. This is where the core logic of the executor lives.

```typescript
// Inside DryRunExecutor class...
public async run(flow: Flow, context: Context, options?: RunOptions): Promise<any> {
    const logger = options?.logger ?? new NullLogger()
    const params = { ...flow.params, ...options?.params }

    logger.info(`[DryRunExecutor] Starting dry run for flow: ${flow.constructor.name}`)

    if (!flow.startNode) {
        logger.warn('[DryRunExecutor] Flow has no start node.')
        return
    }

    let currentNode: AbstractNode | undefined = flow.startNode
    let lastAction: any

    // The executor's main orchestration loop.
    while (currentNode) {
        logger.info(`[DryRunExecutor] --> Visiting node: ${currentNode.constructor.name}`)

        // For a dry run, we simulate execution to get the next action.
        // We run `prep` and `post` to see data flow and branching, but SKIP `exec`.
        // This is a powerful debugging pattern.
        const node = currentNode
        let action

        if (node instanceof Flow) {
            // If the node is a sub-flow, we must run it to get its final action.
            // A real executor (like InMemoryExecutor) delegates this to a helper
            // method, e.g., `_orchestrateGraph(subFlow.startNode, ...)`.
            // For our dry run, we can recursively call ourself.
            action = await new DryRunExecutor().run(node, context, { ...options, params })
        } else {
            // For a regular node, run prep and post, but not exec.
            await node.prep({ ctx: context, params, logger } as any)
            // We call post with a null `execRes` as exec was skipped.
            action = await node.post({ ctx: context, params, logger, execRes: null } as any)
        }

        lastAction = action

        // Display the action for logging.
        const actionDisplay = (typeof lastAction === 'symbol' && lastAction === DEFAULT_ACTION)
            ? 'default'
            : String(lastAction)

        logger.info(`[DryRunExecutor] <-- Node returned action: '${actionDisplay}'`)

        // Find the next node based on the action.
        currentNode = node.successors.get(lastAction)
    }

    logger.info('[DryRunExecutor] Dry run complete.')
    return lastAction
}
```

### 3. Using the Custom Executor

Now you can use this executor with any flow. Note that the node's `exec` logic (the `console.log`) will not run.

```typescript
// main.ts
import { ConsoleLogger, contextKey, Flow, Node, TypedContext } from 'flowcraft'
import { DryRunExecutor } from './executors/dry-run-executor'

const VALUE = contextKey<number>('value')

// A node to set up initial state
const startNode = new Node().prep(async ({ ctx }) => ctx.set(VALUE, 15))

// A conditional node
class CheckValueNode extends Node<void, void, 'over' | 'under'> {
	async post({ ctx }) {
		return ctx.get(VALUE)! > 10 ? 'over' : 'under'
	}
}
const checkNode = new CheckValueNode()

// Nodes for different branches
const overNode = new Node().exec(() => console.log('This should NOT be logged!'))
const underNode = new Node().exec(() => console.log('This should NOT be logged either!'))

// Wire the graph
startNode.next(checkNode)
checkNode.next(overNode, 'over')
checkNode.next(underNode, 'under')

const flow = new Flow(startNode)
const context = new TypedContext()
const logger = new ConsoleLogger()
const dryRunExecutor = new DryRunExecutor()

console.log('--- Starting Dry Run ---')
await flow.run(context, { logger, executor: dryRunExecutor })
```

### Expected Output

When you run this code, you'll see the executor's logs tracing the path. The `context` is modified by `prep` and `post`, so the conditional logic works, but the `console.log` messages inside the `overNode`'s `exec` method will **not** appear.

```
--- Starting Dry Run ---
[INFO] [DryRunExecutor] Starting dry run for flow: Flow
[INFO] [DryRunExecutor] --> Visiting node: Node
[INFO] [DryRunExecutor] <-- Node returned action: 'default'
[INFO] [DryRunExecutor] --> Visiting node: CheckValueNode
[INFO] [DryRunExecutor] <-- Node returned action: 'over'
[INFO] [DryRunExecutor] --> Visiting node: Node
[INFO] [DryRunExecutor] <-- Node returned action: 'default'
[INFO] [DryRunExecutor] Dry run complete.
```

## Real-World Examples

This `DryRunExecutor` is a simplified example. For a complete understanding, it's highly recommended to study the source code of the official executors:

- **`InMemoryExecutor`**: The canonical implementation of a real executor. It shows the full orchestration logic, including how to correctly apply middleware. ([`src/executors/in-memory.ts`](https://github.com/gorango/flowcraft/tree/master/src/executors/in-memory.ts))
- **`BullMQExecutor`**: A full-featured distributed executor. It demonstrates a completely different execution strategy, managing a job queue instead of an in-memory loop. ([`sandbox/5.distributed/src/executor.ts`](https://github.com/gorango/flowcraft/tree/master/sandbox/5.distributed/src/executor.ts))

# Building a Custom Executor

The `IExecutor` pattern is one of Flowcraft's most powerful architectural features. It decouples the definition of a workflow (the graph of `Node`s) from its execution environment. While the default `InMemoryExecutor` is perfect for many use cases, you can create your own executors to run workflows in different environments, such as a distributed task queue, a test environment, or even a system that requires pausing and resuming.

This guide will walk you through the responsibilities of an executor and show you how to build a simple `DryRunExecutor` from scratch.

## The `IExecutor` Interface

At its core, an executor is any class that implements the `IExecutor` interface. The interface is intentionally simple:

```typescript
interface IExecutor {
	run: <T>(flow: Flow<any, T>, context: Context, options?: RunOptions) => Promise<T>
	getNextNode: (curr: AbstractNode, action: any) => AbstractNode | undefined
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
	Flow,
	IExecutor,
	InternalRunOptions,
	Logger,
	Node,
	NodeArgs,
	NullLogger,
	RunOptions,
} from 'flowcraft'

export class DryRunExecutor implements IExecutor {
	// ... implementation ...
}
```

### 2. The `run` Method and Orchestration Loop

The `run` method will prepare the logger and initial parameters and then enter the main orchestration loop. This is where the core logic of the executor lives.

```typescript
// Inside DryRunExecutor class...
public async run(flow: Flow, context: Context, options?: RunOptions): Promise<any> {
	const logger = options?.logger ?? new NullLogger()
	const internalOptions: InternalRunOptions = {
		logger,
		signal: options?.signal,
		params: { ...flow.params, ...options?.params },
		executor: this,
	}

	logger.info(`[DryRunExecutor] Starting dry run for flow: ${flow.constructor.name}`)

	if (!flow.startNode) {
		logger.warn('[DryRunExecutor] Flow has no start node.')
		return
	}

	// Delegate to the private orchestrator method
	const lastAction = await this._orch(flow.startNode, context, internalOptions)

	logger.info('[DryRunExecutor] Dry run complete.')
	return lastAction
}

/**
 * The private orchestration loop that traverses the graph.
 * @private
 */
private async _orch(startNode: AbstractNode, context: Context, options: InternalRunOptions): Promise<any> {
	let currentNode: AbstractNode | undefined = startNode
	let lastAction: any

	while (currentNode) {
		options.logger.info(`[DryRunExecutor] --> Visiting node: ${currentNode.constructor.name}`)

		// We pass a reference to *this* executor in the NodeArgs.
		// This is critical for sub-flows to continue the dry run.
		const nodeArgs: NodeArgs = {
			ctx: context,
			params: { ...options.params, ...currentNode.params },
			logger: options.logger,
			signal: options.signal,
			executor: this,
		} as NodeArgs

		// If the node is a sub-flow, we must call its `exec` method,
		// which contains its own orchestration logic.
		if (currentNode instanceof Flow) {
			lastAction = await currentNode.exec(nodeArgs)
		}
		else if (currentNode instanceof Node) {
			// For a regular node, we simulate the lifecycle but SKIP `exec`.
			// This allows us to see how context changes and branching decisions are made.
			const prepRes = await currentNode.prep(nodeArgs)
			lastAction = await currentNode.post({ ...nodeArgs, prepRes, execRes: undefined })
		}

		const actionDisplay = typeof lastAction === 'symbol' ? lastAction.toString() : lastAction
		options.logger.info(`[DryRunExecutor] <-- Node returned action: '${actionDisplay}'`)

		// Find the next node based on the action.
		// NOTE: In a real executor, you would use `this.getNextNode(currentNode, lastAction)`
		const successors = currentNode.successors.get(lastAction)
		currentNode = successors ? successors[0] : undefined
	}
	return lastAction
}

// Dummy getNextNode to satisfy the interface for this example
public getNextNode(curr: AbstractNode, action: any): AbstractNode | undefined {
    const successors = curr.successors.get(action);
    return successors ? successors[0] : undefined;
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
const startNode = new Node().prep(async ({ ctx }) => await ctx.set(VALUE, 15))

// A conditional node
class CheckValueNode extends Node<void, void, 'over' | 'under'> {
	async post({ ctx }) {
		return (await ctx.get(VALUE)!) > 10 ? 'over' : 'under'
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
[INFO] [DryRunExecutor] <-- Node returned action: 'Symbol(default)'
[INFO] [DryRunExecutor] --> Visiting node: CheckValueNode
[INFO] [DryRunExecutor] <-- Node returned action: 'over'
[INFO] [DryRunExecutor] --> Visiting node: Node
[INFO] [DryRunExecutor] <-- Node returned action: 'Symbol(default)'
[INFO] [DryRunExecutor] Dry run complete.
```

## Real-World Examples

This `DryRunExecutor` is a simplified example. For a complete understanding, it's highly recommended to study the source code of the official executors:

- **`InMemoryExecutor`**: The canonical implementation of a real executor. It shows the full orchestration logic, including how to correctly apply middleware. ([`src/executors/in-memory.ts`](https://github.com/gorango/flowcraft/tree/master/src/executors/in-memory.ts))
- **`BullMQExecutor`**: A full-featured distributed executor. It demonstrates a completely different execution strategy, managing a job queue instead of an in-memory loop. ([`sandbox/5.distributed/src/executor.ts`](https://github.com/gorango/flowcraft/tree/master/sandbox/5.distributed/src/executor.ts))

### Handling Fan-In with `GraphBuilder` Metadata

While the `DryRunExecutor` example shows the basics of traversal, a real-world distributed executor (like the `BullMQExecutor` from the sandbox) needs to solve a much harder problem: how to handle a "fan-in" or "join" point where a node should only run after multiple parallel predecessors have completed.

This is where the metadata from the `GraphBuilder` becomes essential. Your executor's logic for enqueuing the next job would look something like this:

```typescript
// A conceptual look at the logic inside a distributed executor's enqueueing step

// 1. Get the build result once
const { predecessorCountMap, originalPredecessorIdMap } = builder.build(graph)

// 2. When a node (e.g., 'branch-a') finishes, find its successors
for (const nextNode of successors) {
	const nextNodeId = nextNode.id // e.g., 'join-node'
	const predecessorCount = predecessorCountMap.get(nextNodeId)

	// 3. Check if the successor is a fan-in point
	if (predecessorCount <= 1) {
		// Not a join, just enqueue it directly
		queue.add({ nodeId: nextNodeId, ... })
	}
	else {
		// This is a join node! Use Redis to coordinate.
		const predecessorOriginalId = finishedNode.graphData.data.originalId // 'branch-a'

		// The join key is based on the successor's original ID.
		const joinKey = `run:${runId}:join:${nextNode.graphData.data.originalId}`

		// Atomically add the completed predecessor's original ID to a set
		const completedCount = await redis.sadd(joinKey, predecessorOriginalId)

		// 4. Check if all predecessors are done
		if (completedCount >= predecessorCount) {
			// The join is complete! Enqueue the successor.
			queue.add({ nodeId: nextNodeId, ... })
			await redis.del(joinKey) // Clean up the set
		}
	}
}
```

By providing `predecessorCountMap` and `originalPredecessorIdMap`, Flowcraft gives you the exact metadata you need to build this complex coordination logic reliably, without having to re-analyze the graph at runtime.

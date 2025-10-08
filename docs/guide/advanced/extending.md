# Extending Flowcraft: Custom Executors

The `IExecutor` pattern is one of Flowcraft's most powerful architectural features. It decouples the definition of a workflow from its execution environment. While the default `InMemoryExecutor` is perfect for many use cases, you can create your own executors to run workflows in different environments, such as a distributed task queue or a test environment.

This guide will walk you through the responsibilities of an executor and show you how to build a simple `DryRunExecutor` from scratch.

## The `IExecutor` Interface

An executor is any class that implements the `IExecutor` interface:

```typescript
interface IExecutor {
	run: <T>(flow: Flow<any, T>, context: Context, options?: RunOptions) => Promise<T>
	getNextNode: (curr: AbstractNode, action: any) => AbstractNode | undefined
}
```

-   `run`: The main entry point that kicks off the workflow.
-   `getNextNode`: A method that determines the next node to execute based on the current node and the action it returned.

## Core Responsibilities of an Executor

An executor is responsible for the entire orchestration of a `Flow`. This involves:

1.  **An Execution Loop**: Traversing the workflow graph, executing one node at a time.
2.  **Applying Middleware**: Applying any middleware attached to the `Flow` before executing a node.
3.  **Passing Arguments**: Constructing the `NodeArgs` object with the correct context, logger, and a reference to *itself*.
4.  **Handling Branching**: Using `getNextNode` to determine the next step based on a node's returned action.
5.  **State Management**: For distributed systems, this includes serializing and deserializing the `Context`.

## Example: Building a `DryRunExecutor`

Let's build a `DryRunExecutor`. This tool will traverse a workflow and log the path it would take, but it will **not** execute the core `exec()` logic of any node. It's a great way to debug a flow's structure.

```typescript
// src/executors/dry-run-executor.ts
import { AbstractNode, Context, Flow, IExecutor, InternalRunOptions, Node, NodeArgs, NullLogger, RunOptions } from 'flowcraft'

export class DryRunExecutor implements IExecutor {
	public async run(flow: Flow, context: Context, options?: RunOptions): Promise<any> {
		const logger = options?.logger ?? new NullLogger()
		const internalOptions: InternalRunOptions = {
			logger,
			signal: options?.signal,
			params: { ...flow.params, ...options?.params },
			executor: this,
		}

		if (!flow.startNode)
			return

		logger.info(`[DryRunExecutor] Starting dry run for flow: ${flow.constructor.name}`)
		const lastAction = await this._orch(flow.startNode, context, internalOptions)
		logger.info('[DryRunExecutor] Dry run complete.')
		return lastAction
	}

	private async _orch(startNode: AbstractNode, context: Context, options: InternalRunOptions): Promise<any> {
		let currentNode: AbstractNode | undefined = startNode
		let lastAction: any

		while (currentNode) {
			options.logger.info(`[DryRunExecutor] --> Visiting node: ${currentNode.constructor.name}`)

			const nodeArgs = { /* ... construct NodeArgs ... */ } as NodeArgs

			if (currentNode instanceof Flow) {
				lastAction = await currentNode.exec(nodeArgs)
			}
			else if (currentNode instanceof Node) {
				// Simulate the lifecycle but SKIP `exec`.
				const prepRes = await currentNode.prep(nodeArgs)
				lastAction = await currentNode.post({ ...nodeArgs, prepRes, execRes: undefined })
			}

			options.logger.info(`[DryRunExecutor] <-- Node returned action: '${String(lastAction)}'`)
			currentNode = this.getNextNode(currentNode, lastAction)
		}
		return lastAction
	}

	public getNextNode(curr: AbstractNode, action: any): AbstractNode | undefined {
		// For simple executors, we just take the first successor for a given action.
		const successors = curr.successors.get(action)
		return successors?.[0]
	}
}
```

## Connecting to the `GraphBuilder`

A real-world distributed executor needs to handle "fan-in" or "join" points, where a node should only run after multiple parallel predecessors have completed.

This is where the metadata from the `GraphBuilder` becomes essential. Your executor's logic for enqueuing the next job would use the `predecessorCountMap` and `originalPredecessorIdMap` from the `WorkflowBlueprint`.

### Conceptual Distributed Enqueue Logic

```typescript
// When a node (e.g., 'branch-a') finishes, find its successors
for (const nextNode of successors) {
	const nextNodeId = nextNode.graphData.id // The unique, namespaced ID
	const predecessorCount = blueprint.predecessorCountMap[nextNodeId]

	// 1. Check if the successor is a fan-in point
	if (predecessorCount <= 1) {
		// Not a join, enqueue it directly.
		await queue.add({ nodeId: nextNodeId, ... })
	}
	else {
		// 2. This is a join node! Use a shared store (like Redis) to coordinate.
		const predecessorOriginalId = finishedNode.graphData.data.originalId // 'branch-a'
		const joinKey = `run:${runId}:join:${nextNode.graphData.data.originalId}`

		// 3. Atomically track completion.
		const completedCount = await redis.sadd(joinKey, predecessorOriginalId)

		// 4. Check if all predecessors are done.
		if (completedCount >= predecessorCount) {
			// The join is complete! Enqueue the successor.
			await queue.add({ nodeId: nextNodeId, ... })
			await redis.del(joinKey) // Clean up.
		}
	}
}
```

By providing this metadata, Flowcraft gives you the exact tools needed to build complex, reliable coordination logic for distributed systems.

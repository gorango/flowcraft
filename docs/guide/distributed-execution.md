# Distributed Execution

One of Flowcraft's core strengths is its ability to scale from a simple, in-memory script to a distributed system of workers processing jobs from a queue. This is achieved through the **Adapter** pattern.

The [`FlowRuntime`](/api/runtime#flowruntime-class) handles in-memory execution. For distributed systems, you use a **Distributed Adapter** that handles the technology-specific parts of queueing and state management.

## The Adapter Pattern

A distributed system requires three key components:
1.  **A Message Queue**: To enqueue jobs for workers (e.g., RabbitMQ, BullMQ, SQS).
2.  **A Distributed Context**: To store the shared workflow state (e.g., Redis, DynamoDB).
3.  **A Coordination Store**: To handle complex synchronization tasks like fan-in joins (e.g., Redis, ZooKeeper).

The [`BaseDistributedAdapter`](/api/distributed-adapter#basedistributedadapter-abstract-class) provides the core, technology-agnostic orchestration logic. To create a concrete implementation (like the official [`@flowcraft/bullmq-adapter`](/guide/adapters/bullmq)), you extend this base class and implement a few key methods.

## Core Concepts

-   **`BaseDistributedAdapter`**: The abstract class that orchestrates the distributed execution of a single node.
-   **`ICoordinationStore`**: An interface for an atomic key-value store needed for distributed locking and counters. This is crucial for correctly implementing `joinStrategy` in a distributed environment.
-   **`IAsyncContext`**: The asynchronous context interface used to manage state remotely.
-   **`JobPayload`**: The data structure for a job placed on the queue.

## Example: Using BullMQ

Flowcraft provides an [official adapter](/guide/adapters/bullmq) for [BullMQ](https://bullmq.io/), which uses Redis for both the queue and state management.

Here's how you might set up a worker:

```typescript
// worker.ts
import { BullMQAdapter, RedisCoordinationStore } from '@flowcraft/bullmq-adapter'
import IORedis from 'ioredis'
// Assume agentNodeRegistry and blueprints are loaded here
import { agentNodeRegistry, blueprints } from './shared'

async function main() {
	const redisConnection = new IORedis()

	// 1. Create the coordination store using Redis.
	const coordinationStore = new RedisCoordinationStore(redisConnection)

	// 2. Instantiate the adapter.
	const adapter = new BullMQAdapter({
		connection: redisConnection,
		coordinationStore,
		runtimeOptions: {
			registry: agentNodeRegistry,
			blueprints,
		},
	})

	// 3. Start the worker. It will begin listening for jobs.
	adapter.start()
	console.log('Worker is running...')
}

main()
```

Here's how a client might start a workflow:

```typescript
// client.ts
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

async function startWorkflow() {
	const redis = new IORedis()
	const queue = new Queue('flowcraft-queue', { connection: redis })
	const runId = crypto.randomUUID()

	// Analyze the blueprint to find the start node(s).
	const startNodeId = 'my-start-node'

	// Enqueue a job for the first node.
	await queue.add('executeNode', {
		runId,
		blueprintId: 'my-workflow',
		nodeId: startNodeId,
	})

	console.log(`Workflow ${runId} started.`)
	// ... logic to wait for the final result ...
}
```
This architecture decouples the core workflow logic from the distributed systems infrastructure, allowing you to scale your application without rewriting your business logic.

## Error Handling in Distributed Joins

In distributed execution, handling failures in join scenarios is critical to prevent workflows from stalling or entering ambiguous states.

### Poison Pill Mechanism for 'all' Joins

For nodes with `joinStrategy: 'all'`, if a predecessor fails, a "poison pill" is written to the coordination store. This prevents the join node from waiting indefinitely for the failed predecessor and causes it to fail immediately when it tries to check readiness.

### Cancellation Mechanism for 'any' Joins

For nodes with `joinStrategy: 'any'`, if a predecessor fails, a "cancellation pill" is written to the coordination store. This ensures that:

1. The join node cannot be locked by other predecessors after a failure
2. If the join node is already locked, it will fail when it tries to execute, preventing ambiguous states

This mechanism ensures that `any` joins fail fast when a predecessor fails, rather than remaining in an indeterminate state.

```typescript
// Example: A workflow with 'any' join
const workflow = createFlow('any-join-example')
  .node('A', async () => { throw new Error('A failed') })
  .node('B', async () => ({ output: 'B succeeded' }))
  .node('C', async ({ input }) => ({ output: `Result: ${input}` }), {
    config: { joinStrategy: 'any' }
  })
  .edge('A', 'C')
  .edge('B', 'C')
  .toBlueprint()

// In distributed execution, if 'A' fails, 'C' will be cancelled
// and the workflow will fail, preventing 'B' from executing 'C' alone
```

This robust error handling ensures that distributed workflows maintain consistency and reliability even when individual nodes fail.

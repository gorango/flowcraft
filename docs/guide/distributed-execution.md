# Extending Flowcraft: Distributed Execution

One of Flowcraft's core strengths is its ability to scale from a simple, in-memory script to a distributed system of workers processing jobs from a queue. This is achieved through the **Adapter** pattern.

The `FlowRuntime` handles in-memory execution. For distributed systems, you use a **Distributed Adapter** that handles the technology-specific parts of queueing and state management.

### The Adapter Pattern

A distributed system requires three key components:
1.  **A Message Queue**: To enqueue jobs for workers (e.g., RabbitMQ, BullMQ, SQS).
2.  **A Distributed Context**: To store the shared workflow state (e.g., Redis, DynamoDB).
3.  **A Coordination Store**: To handle complex synchronization tasks like fan-in joins (e.g., Redis, ZooKeeper).

The `BaseDistributedAdapter` provides the core, technology-agnostic orchestration logic. To create a concrete implementation (like the official `@flowcraft/bullmq-adapter`), you extend this base class and implement a few key methods.

### Core Concepts

-   **`BaseDistributedAdapter`**: The abstract class that orchestrates the distributed execution of a single node.
-   **`ICoordinationStore`**: An interface for an atomic key-value store needed for distributed locking and counters. This is crucial for correctly implementing `joinStrategy` in a distributed environment.
-   **`IAsyncContext`**: The asynchronous context interface used to manage state remotely.
-   **`JobPayload`**: The data structure for a job placed on the queue.

### Example: Using the BullMQ Adapter (Conceptual)

Flowcraft provides an official adapter for [BullMQ](https://bullmq.io/), which uses Redis for both the queue and state management.

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

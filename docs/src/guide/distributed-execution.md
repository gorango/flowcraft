# Distributed Execution

One of Flowcraft's core strengths is its ability to scale from a simple, in-memory script to a distributed system of workers processing jobs from a queue. This is achieved through the **Adapter** pattern.

The [`FlowRuntime`](/api/runtime#flowruntime-class) handles in-memory execution. For distributed systems, you use a **Distributed Adapter** that handles the technology-specific parts of queueing and state management.

> [!TIP]
> Your core business logic—the node implementations—remains exactly the same whether you're running in-memory or distributed. Simply swap the adapter, and your workflows scale without rewriting a single line of node code. This seamless transition is a huge selling point for teams building scalable AI agents and data pipelines.

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

## Delta-Based Persistence

Distributed workflows with large state objects benefit from **delta-based persistence**, where only context changes (deltas) are persisted instead of the entire state after each node execution. This optimization provides:

- **80-95% reduction** in payload size and network traffic
- **Lower database costs** through targeted updates (WCUs, DTUs, etc.)
- **Improved concurrency** with smaller atomic operations
- **Better scalability** for workflows with complex, evolving state

The runtime automatically tracks changes via `TrackedAsyncContext` and applies them atomically using each adapter's optimized `patch()` implementation.

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

## Reconciliation Resilience

The `reconcile` method in `BaseDistributedAdapter` is used to resume a workflow run by inspecting the persisted context, determining the next executable nodes, and enqueuing jobs for them. To increase resilience, the adapter stores the `blueprintId` in both the context and the coordination store as a fallback. If the `blueprintId` is missing from the context during reconciliation, it will be retrieved from the coordination store, preventing failures due to lost context data.

This mechanism ensures that workflow runs can be reliably resumed even if parts of the distributed state are temporarily unavailable or corrupted.

## Workflow Versioning

In distributed systems, it's crucial to ensure that workers processing jobs are compatible with the blueprint version they were designed for. Flowcraft provides built-in workflow versioning to prevent state corruption during rolling deployments.

### Version Field in Metadata

Blueprints can include an optional `version` field in their metadata:

```typescript
const blueprint: WorkflowBlueprint = {
  id: 'my-workflow',
  metadata: {
    version: '1.2.0'
  },
  nodes: [...],
  edges: [...]
}
```

### Version Compatibility Checking

When a workflow run is initiated, the blueprint version is stored in the distributed context. Each worker checks this version before processing jobs:

- **Matching versions**: Jobs are processed normally
- **Mismatched versions**: Jobs are rejected, allowing correctly-versioned workers to pick them up
- **Unversioned blueprints**: Work seamlessly with existing deployments

This ensures zero-downtime deployments where old and new versions of workflows can coexist safely in the same distributed system.

### Example: Safe Rolling Deployment

```typescript
// Version 1.0.0 blueprint
const v1Blueprint: WorkflowBlueprint = {
  id: 'payment-processor',
  metadata: { version: '1.0.0' },
  nodes: [
    { id: 'validate', uses: 'validate-payment' },
    { id: 'process', uses: 'process-payment-v1' }
  ],
  edges: [{ source: 'validate', target: 'process' }]
}

// Version 2.0.0 blueprint with new logic
const v2Blueprint: WorkflowBlueprint = {
  id: 'payment-processor',
  metadata: { version: '2.0.0' },
  nodes: [
    { id: 'validate', uses: 'validate-payment' },
    { id: 'process', uses: 'process-payment-v2' },
    { id: 'audit', uses: 'audit-payment' }
  ],
  edges: [
    { source: 'validate', target: 'process' },
    { source: 'process', target: 'audit' }
  ]
}
```

During deployment, workflows started with v1.0.0 will only be processed by v1.0.0 workers, while new workflows can use v2.0.0. This prevents state corruption and ensures reliable operation during updates.

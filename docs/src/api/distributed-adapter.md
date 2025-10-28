# Distributed Adapter

The distributed adapter pattern is the mechanism for scaling Flowcraft beyond a single process. This section details the core components for building your own adapter.

## `BaseDistributedAdapter` Abstract Class

The base class for all distributed adapters. It handles the technology-agnostic orchestration logic, leaving queue-specific implementation details to subclasses.

### `constructor(options)`
-   **`options`** `AdapterOptions`:
    -   **`runtimeOptions`**: The `RuntimeOptions` to configure the internal [`FlowRuntime`](/api/runtime#flowruntime-class) instance.
    -   **`coordinationStore`**: An instance of `ICoordinationStore`.

### Abstract Methods to Implement
-   **`protected abstract createContext(runId)`**: Must return an instance of a distributed `IAsyncContext`.
-   **`protected abstract processJobs(handler)`**: Must set up a listener on the message queue and call the provided `handler` for each job.
-   **`protected abstract enqueueJob(job)`**: Must enqueue a new job onto the message queue.
-   **`protected abstract publishFinalResult(runId, result)`**: Must publish the final result of a workflow run.

## `ICoordinationStore` Interface

Defines the contract for an atomic, distributed key-value store required for coordination tasks like fan-in joins and distributed locks.

```typescript
interface ICoordinationStore {
	// Atomically increments a key and returns the new value.
	increment: (key: string, ttlSeconds: number) => Promise<number>

	// Sets a key only if it does not already exist.
	setIfNotExist: (key: string, value: string, ttlSeconds: number) => Promise<boolean>

	// Extends the TTL of an existing key. Used for heartbeat mechanism in long-running jobs.
	extendTTL: (key: string, ttlSeconds: number) => Promise<boolean>

	// Deletes a key.
	delete: (key: string) => Promise<void>

	// Gets the value of a key.
	get: (key: string) => Promise<string | undefined>
}
```

## `JobPayload` Interface

The data payload expected for a job in the message queue.

```typescript
interface JobPayload {
	runId: string
	blueprintId: string
	nodeId: string
}
```

## Delta-Based Persistence

All distributed adapters now support **delta-based persistence** for optimal performance with large state objects. Instead of serializing and transmitting the entire workflow context after each node execution, adapters use the `patch()` method to apply only the changes (deltas) atomically.

Each adapter implements `patch()` using its database's most efficient partial update mechanism:
- **DynamoDB (SQS)**: `UpdateExpression` with `SET` and `REMOVE`
- **Redis (BullMQ)**: `HSET` and `HDEL` for hash operations
- **PostgreSQL (RabbitMQ)**: `jsonb_set()` and `#-` operators
- **Azure Cosmos DB**: Native patch operations (`set`/`remove`)
- **Google Firestore**: `update()` with `FieldValue.delete()`
- **Apache Cassandra (Kafka)**: Read-modify-write pattern

## Built-in Adapters

- **[`@flowcraft/bullmq-adapter`](https://www.npmjs.com/package/@flowcraft/bullmq-adapter)**: BullMQ and Redis.
- **[`@flowcraft/sqs-adapter`](https://www.npmjs.com/package/@flowcraft/sqs-adapter)**: AWS SQS and DynamoDB.
- **[`@flowcraft/gcp-adapter`](https://www.npmjs.com/package/@flowcraft/gcp-adapter)**: Google Pub/Sub, Firestore, and Redis.
- **[`@flowcraft/azure-adapter`](https://www.npmjs.com/package/@flowcraft/azure-adapter)**: Azure Queues, Cosmos DB, and Redis.
- **[`@flowcraft/kafka-adapter`](https://www.npmjs.com/package/@flowcraft/kafka-adapter)**: Apache Kafka, Cassandra, and Redis.
- **[`@flowcraft/rabbitmq-adapter`](https://www.npmjs.com/package/@flowcraft/rabbitmq-adapter)**: RabbitMQ, PostgreSQL, and Redis.

For examples, see the [Adapters Guide](/guide/adapters/).

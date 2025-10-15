# Distributed Adapter

The distributed adapter pattern is the mechanism for scaling Flowcraft beyond a single process. This section details the core components for building your own adapter.

## `BaseDistributedAdapter` Abstract Class

The base class for all distributed adapters. It handles the technology-agnostic orchestration logic, leaving queue-specific implementation details to subclasses.

### `constructor(options)`
-   **`options`** `AdapterOptions`:
    -   **`runtimeOptions`**: The `RuntimeOptions` to configure the internal `FlowRuntime` instance.
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

	// Deletes a key.
	delete: (key: string) => Promise<void>
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

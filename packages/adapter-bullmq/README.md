# Flowcraft Adapter for BullMQ

[![NPM Version](https://img.shields.io/npm/v/@flowcraft/bullmq-adapter.svg)](https://www.npmjs.com/package/@flowcraft/bullmq-adapter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This package provides a distributed adapter for [Flowcraft](https://www.npmjs.com/package/flowcraft) that leverages BullMQ. It uses Redis for highly efficient job queuing, state persistence, and coordination, making it a powerful and streamlined choice for distributed workflows.

## Features

- **Distributed Execution**: Run your workflows across a fleet of workers with ease.
- **High-Performance Job Queuing**: Built on BullMQ, it offers a robust and fast job queue system powered by Redis.
- **Centralized State Persistence**: Uses Redis Hashes to store and manage workflow context, ensuring data is consistent across all workers.
- **Integrated Coordination**: Leverages Redis's atomic commands for all coordination tasks, including fan-in joins and distributed locking.
- **Workflow Reconciliation**: Includes a reconciler utility to detect and resume stalled workflows, ensuring fault tolerance in production environments.

## Installation

You need to install the core `flowcraft` package along with this adapter and its peer dependencies.

```bash
npm install flowcraft @flowcraft/bullmq-adapter bullmq ioredis
```

## Prerequisites

To use this adapter, you must have a Redis instance that is accessible by all your workers.

## Usage

The following example demonstrates how to set up and start a worker to process Flowcraft jobs using BullMQ and Redis.

```typescript
import { BullMQAdapter, RedisCoordinationStore } from '@flowcraft/bullmq-adapter'
import { FlowRuntime } from 'flowcraft'
import Redis from 'ioredis'

// 1. Define your workflow blueprints and registry
const blueprints = { /* your workflow blueprints */ }
const registry = { /* your node implementations */ }

// 2. Initialize the Redis client
// This single connection will be used by BullMQ, the context, and the coordination store.
const redisConnection = new Redis('YOUR_REDIS_CONNECTION_STRING')

// 3. Create a runtime configuration
const runtime = new FlowRuntime({ blueprints, registry })

// 4. Set up the coordination store
const coordinationStore = new RedisCoordinationStore(redisConnection)

// 5. Initialize the adapter
const adapter = new BullMQAdapter({
	runtimeOptions: runtime.options,
	coordinationStore,
	connection: redisConnection,
	queueName: 'my-workflow-queue', // Optional: defaults to 'flowcraft-queue'
})

// 6. Start the worker to begin processing jobs
adapter.start()

console.log('Flowcraft worker with BullMQ adapter is running...')
```

## Components

- **`BullMQAdapter`**: The main adapter class that connects to a BullMQ queue, processes jobs using the `FlowRuntime`, and adds new jobs as the workflow progresses.
- **`RedisContext`**: An `IAsyncContext` implementation that stores and retrieves workflow state from a Redis Hash, where each workflow run has its own hash key.
- **`RedisCoordinationStore`**: An `ICoordinationStore` implementation that uses Redis to handle atomic operations for distributed coordination.
- **`createBullMQReconciler`**: A utility function for creating a reconciler that scans Redis for stalled workflows and resumes them.

## Reconciliation

The BullMQ adapter includes a reconciliation utility that helps detect and resume stalled workflows. This is particularly useful in production environments where workers might crash or be restarted.

### Usage

```typescript
import { createBullMQReconciler } from '@flowcraft/bullmq-adapter'

// Create a reconciler instance
const reconciler = createBullMQReconciler({
  adapter: myBullMQAdapter,
  redis: myRedisClient,
  stalledThresholdSeconds: 300, // 5 minutes
  keyPrefix: 'workflow:state:', // Optional: defaults to 'workflow:state:'
  scanCount: 100, // Optional: defaults to 100
})

// Run reconciliation
const stats = await reconciler.run()
console.log(`Scanned ${stats.scannedKeys} keys, found ${stats.stalledRuns} stalled runs, reconciled ${stats.reconciledRuns} runs`)
```

### Reconciliation Stats

The reconciler returns detailed statistics:

```typescript
interface ReconciliationStats {
  scannedKeys: number    // Number of Redis keys scanned
  stalledRuns: number    // Number of workflows identified as stalled
  reconciledRuns: number // Number of workflows successfully resumed
  failedRuns: number     // Number of reconciliation attempts that failed
}
```

### How It Works

The reconciler scans Redis keys matching the specified prefix and checks their idle time. If a workflow has been idle for longer than the threshold, it attempts to reconcile it by:

1. Loading the workflow's current state
2. Determining which nodes are ready to execute
3. Acquiring appropriate locks to prevent race conditions
4. Enqueuing jobs for ready nodes

This ensures that workflows can be resumed even after worker failures or restarts.

## License

This package is licensed under the [MIT License](LICENSE).

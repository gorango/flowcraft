# Flowcraft Adapter for Azure

[![NPM Version](https://img.shields.io/npm/v/@flowcraft/azure-adapter.svg)](https://www.npmjs.com/package/@flowcraft/azure-adapter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This package provides a distributed adapter for [Flowcraft](https://www.npmjs.com/package/flowcraft) that leverages Microsoft Azure services. It uses Azure Queue Storage for robust job queuing, Azure Cosmos DB for scalable state persistence, and a Redis instance for high-performance coordination tasks.

## Features

- **Distributed Execution**: Scale your workflows horizontally by running them across multiple workers.
- **Resilient Job Queuing**: Utilizes Azure Queue Storage to ensure that workflow jobs are durable and processed reliably.
- **Scalable State Persistence**: Leverages Azure Cosmos DB to store and manage the context of each workflow run, enabling fault tolerance and stateful recovery.
- **High-Performance Coordination**: Uses Redis for atomic operations required for complex patterns like fan-in joins and distributed locks.
- **Workflow Reconciliation**: Includes a reconciler utility to detect and resume stalled workflows, ensuring fault tolerance in production environments.

## Installation

You need to install the core `flowcraft` package along with this adapter and its peer dependencies.

```bash
npm install flowcraft @flowcraft/azure-adapter @azure/storage-queue @azure/cosmos ioredis
```

## Prerequisites

To use this adapter, you must have the following Azure and Redis resources provisioned:
- An Azure Storage Account with a Queue created.
- An Azure Cosmos DB account (Core SQL API) with a database and two containers: one for context and one for final status.
- A Redis instance (e.g., Azure Cache for Redis) accessible by your workers.

## Usage

The following example demonstrates how to set up and start a worker that can process Flowcraft jobs.

```typescript
import { CosmosClient } from '@azure/cosmos'
import { QueueClient } from '@azure/storage-queue'
import { AzureQueueAdapter, RedisCoordinationStore } from '@flowcraft/azure-adapter'
import { FlowRuntime } from 'flowcraft'
import Redis from 'ioredis'

// 1. Define your workflow blueprints and registry
const blueprints = { /* your workflow blueprints */ }
const registry = { /* your node implementations */ }

// 2. Initialize service clients
const queueClient = new QueueClient('YOUR_AZURE_STORAGE_CONNECTION_STRING', 'your-queue-name')
const cosmosClient = new CosmosClient('YOUR_COSMOS_DB_CONNECTION_STRING')
const redisClient = new Redis('YOUR_REDIS_CONNECTION_STRING')

// 3. Create a runtime configuration
const runtime = new FlowRuntime({ blueprints, registry })

// 4. Set up the coordination store
const coordinationStore = new RedisCoordinationStore(redisClient)

// 5. Initialize the adapter
const adapter = new AzureQueueAdapter({
	runtimeOptions: runtime.options,
	coordinationStore,
	queueClient,
	cosmosClient,
	cosmosDatabaseName: 'your-cosmos-db-name',
	contextContainerName: 'workflow-contexts',
	statusContainerName: 'workflow-statuses',
})

// 6. Start the worker to begin processing jobs from the queue
adapter.start()

console.log('Flowcraft worker with Azure adapter is running...')
```

## Components

- **`AzureQueueAdapter`**: The main adapter class that orchestrates job dequeuing, execution via the `FlowRuntime`, and enqueuing of subsequent jobs.
- **`CosmosDbContext`**: An `IAsyncContext` implementation that stores and retrieves workflow state from a specified Azure Cosmos DB container.
- **`RedisCoordinationStore`**: An `ICoordinationStore` implementation that uses Redis to handle atomic operations for distributed coordination.
- **`createAzureReconciler`**: A utility function for creating a reconciler that queries Cosmos DB for stalled workflows and resumes them.

## Reconciliation

The Azure adapter includes a reconciliation utility that helps detect and resume stalled workflows. This is particularly useful in production environments where workers might crash or be restarted.

### Prerequisites for Reconciliation

To use reconciliation, your status container must include `status` and `lastUpdated` fields that track workflow state. The adapter automatically updates these fields during job processing.

### Usage

```typescript
import { createAzureReconciler } from '@flowcraft/azure-adapter'

// Create a reconciler instance
const reconciler = createAzureReconciler({
  adapter: myAzureAdapter,
  cosmosClient: myCosmosClient,
  cosmosDatabaseName: 'my-database',
  statusContainerName: 'workflow-statuses',
  stalledThresholdSeconds: 300, // 5 minutes
})

// Run reconciliation
const stats = await reconciler.run()
console.log(`Found ${stats.stalledRuns} stalled runs, reconciled ${stats.reconciledRuns} runs`)
```

### Reconciliation Stats

The reconciler returns detailed statistics:

```typescript
interface ReconciliationStats {
  stalledRuns: number    // Number of workflows identified as stalled
  reconciledRuns: number // Number of workflows successfully resumed
  failedRuns: number     // Number of reconciliation attempts that failed
}
```

### How It Works

The reconciler queries the status container for workflows with `status = 'running'` that haven't been updated within the threshold period. For each stalled workflow, it:

1. Loads the workflow's current state from the context container
2. Determines which nodes are ready to execute based on completed predecessors
3. Acquires appropriate locks to prevent race conditions
4. Enqueues jobs for ready nodes via Azure Queue Storage

This ensures that workflows can be resumed even after worker failures or restarts.

## License

This package is licensed under the [MIT License](LICENSE).

# Runtime Adapter: Azure (Queues & Cosmos DB)

[![npm version](https://img.shields.io/npm/v/@flowcraft/azure-adapter.svg)](https://www.npmjs.com/package/@flowcraft/azure-adapter)

The Azure adapter provides a fully native solution for running distributed workflows on Microsoft Azure. It uses **Azure Storage Queues** for reliable job queuing and **Azure Cosmos DB** for the context store. For the coordination store, it relies on Redis.

This is an excellent choice for applications built on the Azure stack.

## Installation

You will need the adapter package, the Azure clients, and `ioredis`.

```bash
npm install @flowcraft/azure-adapter @azure/storage-queue @azure/cosmos ioredis
```

## Architecture

This adapter leverages native Azure services for the queue and context, with Redis handling coordination.

```mermaid
graph TD
    subgraph "Application"
        Worker("⚙️ Flowcraft Worker<br><small>(VM, App Service, or AKS)</small>")
    end

    subgraph "Azure"
        Queue[("Azure Storage Queue")]
        State[("Azure Cosmos DB Container")]
    end

    subgraph "Redis"
        Coordination[("Coordination Store")]
    end

    Worker -- "Polls for Jobs" --> Queue
    Worker -- "Reads/Writes State" --> State
    Worker -- "Manages Locks/Counters" --> Coordination
```

## Usage

The following example shows how to configure and start a worker using the `AzureQueueAdapter`.

#### `worker.ts`
```typescript
import { CosmosClient } from '@azure/cosmos'
import { QueueClient } from '@azure/storage-queue'
import { AzureQueueAdapter, RedisCoordinationStore } from '@flowcraft/azure-adapter'
import IORedis from 'ioredis'
// Assume agentNodeRegistry and blueprints are loaded from your application's shared files.
import { agentNodeRegistry, blueprints } from './shared'

async function main() {
	console.log('--- Starting Flowcraft Worker (Azure) ---')

	// 1. Instantiate clients using connection strings from environment variables.
	const queueClient = new QueueClient(process.env.AZURE_STORAGE_CONNECTION_STRING, 'flowcraft-jobs')
	const cosmosClient = new CosmosClient(process.env.COSMOS_DB_CONNECTION_STRING)
	const redisConnection = new IORedis(process.env.REDIS_URL)

	// 2. Create the coordination store using Redis.
	const coordinationStore = new RedisCoordinationStore(redisConnection)

	// 3. Instantiate the adapter.
	const adapter = new AzureQueueAdapter({
		queueClient,
		cosmosClient,
		coordinationStore,
		cosmosDatabaseName: 'flowcraftDb', // You must create this database
		contextContainerName: 'contexts', // You must create this container
		statusContainerName: 'statuses', // You must create this container
		runtimeOptions: {
			registry: agentNodeRegistry,
			blueprints,
		},
	})

	// 4. Start the worker. It will begin polling the Azure Queue for jobs.
	adapter.start()

	console.log('Worker is running. Waiting for jobs...')
}

main().catch(console.error)
```

## Workflow Reconciliation

To enhance fault tolerance, the Azure adapter includes a utility for detecting and resuming stalled workflows. This is critical in production environments where workers might crash, leaving workflows in an incomplete state.

### How It Works

The reconciler queries the Cosmos DB `statuses` container for workflows that have a `status` of 'running' but have not been updated in a configurable amount of time (the `stalledThresholdSeconds`). For each stalled run, it safely re-enqueues the next set of executable nodes. The adapter automatically maintains the `lastUpdated` timestamp on the status item.

### Reconciler Usage

A reconciliation process should be run periodically as a separate script or scheduled job (e.g., a cron job, Azure Function with a Timer Trigger, or a simple `setInterval`).

#### `reconcile.ts`
```typescript
import { createAzureReconciler } from '@flowcraft/azure-adapter';

// Assume 'adapter' and 'cosmosClient' are initialized just like in your worker
const reconciler = createAzureReconciler({
  adapter,
  cosmosClient,
  cosmosDatabaseName: 'flowcraftDb',
  statusContainerName: 'statuses',
  stalledThresholdSeconds: 300, // 5 minutes
});

async function runReconciliation() {
  console.log('Starting reconciliation cycle...');
  const stats = await reconciler.run();
  console.log(`Reconciliation complete. Stalled: ${stats.stalledRuns}, Resumed: ${stats.reconciledRuns}, Failed: ${stats.failedRuns}`);
}

// Run this function on a schedule
runReconciliation();
```

The `run()` method returns a `ReconciliationStats` object:
-   `stalledRuns`: Number of workflows identified as stalled.
-   `reconciledRuns`: Number of workflows where at least one job was successfully re-enqueued.
-   `failedRuns`: Number of workflows where an error occurred during the reconciliation attempt.

## Key Components

-   **Job Queue**: Uses Azure Storage Queues. The adapter polls for messages and deletes them upon successful processing.
-   **Context Store**: The `CosmosDbContext` class stores the state for each workflow run as a single item in a Cosmos DB container, partitioned by `runId`.
-   **Coordination Store**: The `RedisCoordinationStore` uses atomic Redis commands (`INCR`, `SETNX`) to manage distributed locks and counters for fan-in joins.
-   **Reconciler**: The `createAzureReconciler` factory provides a utility to find and resume stalled workflows.

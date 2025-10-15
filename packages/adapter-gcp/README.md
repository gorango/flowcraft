# Flowcraft Adapter for Google Cloud

[![NPM Version](https://img.shields.io/npm/v/@flowcraft/gcp-adapter.svg)](https://www.npmjs.com/package/@flowcraft/gcp-adapter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This package provides a distributed adapter for [Flowcraft](https://www.npmjs.com/package/flowcraft) that leverages Google Cloud services. It uses Google Cloud Pub/Sub for asynchronous messaging, Google Cloud Firestore for scalable state persistence, and a Redis instance for high-performance coordination.

## Features

- **Distributed Execution**: Scale your workflows horizontally across multiple workers or serverless functions.
- **Reliable Messaging**: Utilizes Google Cloud Pub/Sub to ensure at-least-once delivery of workflow jobs.
- **Serverless State Persistence**: Leverages Google Cloud Firestore to store and manage workflow context in a highly available and scalable NoSQL database.
- **High-Performance Coordination**: Uses Redis for atomic operations required for complex patterns like fan-in joins.
- **Workflow Reconciliation**: Includes a reconciler utility to detect and resume stalled workflows, ensuring fault tolerance in production environments.

## Installation

You need to install the core `flowcraft` package along with this adapter and its peer dependencies.

```bash
npm install flowcraft @flowcraft/gcp-adapter @google-cloud/pubsub @google-cloud/firestore ioredis
```

## Prerequisites

To use this adapter, you must have the following Google Cloud and Redis resources provisioned:
- A Google Cloud project with the Pub/Sub and Firestore APIs enabled.
- A Pub/Sub topic and a corresponding subscription.
- A Firestore database with two collections: one for context and one for final status.
- A Redis instance (e.g., Memorystore for Redis) accessible by your workers.

## Usage

The following example demonstrates how to configure and start a worker to process Flowcraft jobs.

```typescript
import { PubSubAdapter, RedisCoordinationStore } from '@flowcraft/gcp-adapter'
import { Firestore } from '@google-cloud/firestore'
import { PubSub } from '@google-cloud/pubsub'
import { FlowRuntime } from 'flowcraft'
import Redis from 'ioredis'

// 1. Define your workflow blueprints and registry
const blueprints = { /* your workflow blueprints */ }
const registry = { /* your node implementations */ }

// 2. Initialize service clients
const pubsubClient = new PubSub({ projectId: 'your-gcp-project-id' })
const firestoreClient = new Firestore({ projectId: 'your-gcp-project-id' })
const redisClient = new Redis('YOUR_REDIS_CONNECTION_STRING')

// 3. Create a runtime configuration
const runtime = new FlowRuntime({ blueprints, registry })

// 4. Set up the coordination store
const coordinationStore = new RedisCoordinationStore(redisClient)

// 5. Initialize the adapter
const adapter = new PubSubAdapter({
	runtimeOptions: runtime.options,
	coordinationStore,
	pubsubClient,
	firestoreClient,
	topicName: 'your-pubsub-topic',
	subscriptionName: 'your-pubsub-subscription',
	contextCollectionName: 'workflow-contexts',
	statusCollectionName: 'workflow-statuses',
})

// 6. Start the worker to listen for messages
adapter.start()

console.log('Flowcraft worker with GCP adapter is running...')
```

## Components

- **`PubSubAdapter`**: The main adapter class that subscribes to a Pub/Sub topic, processes messages using the `FlowRuntime`, and publishes new jobs as the workflow progresses.
- **`FirestoreContext`**: An `IAsyncContext` implementation that stores and retrieves workflow state from a specified Firestore collection.
- **`RedisCoordinationStore`**: An `ICoordinationStore` implementation that uses Redis to handle atomic operations for distributed coordination.
- **`createGcpReconciler`**: A utility function for creating a reconciler that queries Firestore for stalled workflows and resumes them.

## Reconciliation

The GCP adapter includes a reconciliation utility that helps detect and resume stalled workflows. This is particularly useful in production environments where workers might crash or be restarted.

### Prerequisites for Reconciliation

To use reconciliation, your status collection must include `status` and `lastUpdated` fields that track workflow state. The adapter automatically updates these fields during job processing.

### Usage

```typescript
import { createGcpReconciler } from '@flowcraft/gcp-adapter'

// Create a reconciler instance
const reconciler = createGcpReconciler({
  adapter: myGcpAdapter,
  firestoreClient: myFirestoreClient,
  statusCollectionName: 'workflow-statuses',
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

The reconciler queries the status collection for workflows with `status = 'running'` that haven't been updated within the threshold period. For each stalled workflow, it:

1. Loads the workflow's current state from the context collection
2. Determines which nodes are ready to execute based on completed predecessors
3. Acquires appropriate locks to prevent race conditions
4. Publishes jobs for ready nodes via Google Cloud Pub/Sub

This ensures that workflows can be resumed even after worker failures or restarts.

## License

This package is licensed under the [MIT License](LICENSE).

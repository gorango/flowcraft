# Adapter: Google Cloud (Pub/Sub & Firestore)

[![npm version](https://img.shields.io/npm/v/@flowcraft/gcp-adapter.svg)](https://www.npmjs.com/package/@flowcraft/gcp-adapter)

The Google Cloud adapter provides a fully native, serverless-friendly solution for running distributed workflows on GCP. It uses **Pub/Sub** for event-driven job queuing and **Firestore** for the context store. For the coordination store, it relies on Redis.

This is an ideal choice for applications built on the Google Cloud Platform.

## Installation

You will need the adapter package, the GCP clients, and `ioredis`.

```bash
npm install @flowcraft/gcp-adapter @google-cloud/pubsub @google-cloud/firestore ioredis
```

## Architecture

This adapter leverages native GCP services for the queue and context, with Redis handling coordination.

```mermaid
graph TD
    subgraph "Application"
        Worker("⚙️ Flowcraft Worker<br><small>(GCE, GKE, or Cloud Run)</small>")
    end

    subgraph "Google Cloud"
        Queue[("Cloud Pub/Sub Topic")]
        State[("Cloud Firestore Collection")]
    end

    subgraph "Redis"
        Coordination[("Coordination Store")]
    end

    Worker -- "Subscribes to Topic" --> Queue
    Worker -- "Reads/Writes State" --> State
    Worker -- "Manages Locks/Counters" --> Coordination
```

## Usage

The following example shows how to configure and start a worker using the `PubSubAdapter`.

#### `worker.ts`
```typescript
import { FirestoreContext, PubSubAdapter, RedisCoordinationStore } from '@flowcraft/gcp-adapter'
import { Firestore } from '@google-cloud/firestore'
import { PubSub } from '@google-cloud/pubsub'
import IORedis from 'ioredis'
// Assume agentNodeRegistry and blueprints are loaded from your application's shared files.
import { agentNodeRegistry, blueprints } from './shared'

async function main() {
	console.log('--- Starting Flowcraft Worker (GCP Pub/Sub) ---')

	const projectId = process.env.GCP_PROJECT_ID
	const redisUrl = process.env.REDIS_URL // e.g., 'redis://:password@host:port'

	// 1. Instantiate the GCP and Redis clients.
	// In a real environment, credentials will be picked up automatically from the environment.
	const pubsubClient = new PubSub({ projectId })
	const firestoreClient = new Firestore({ projectId })
	const redisConnection = new IORedis(redisUrl)

	// 2. Create the coordination store using Redis.
	const coordinationStore = new RedisCoordinationStore(redisConnection)

	// 3. Instantiate the adapter.
	const adapter = new PubSubAdapter({
		pubsubClient,
		firestoreClient,
		coordinationStore,
		topicName: 'flowcraft-jobs', // You must create this topic
		subscriptionName: 'flowcraft-workers', // You must create this subscription
		contextCollectionName: 'flowcraft-contexts',
		statusCollectionName: 'flowcraft-statuses',
		runtimeOptions: {
			registry: agentNodeRegistry,
			blueprints,
		},
	})

	// 4. Start the worker. It will begin listening for messages on the Pub/Sub subscription.
	adapter.start()

	console.log('Worker is running. Waiting for jobs...')
}

main().catch(console.error)
```

## Key Components

-   **Job Queue**: Uses a Google Cloud Pub/Sub topic and subscription. The adapter is event-driven, listening for messages pushed from the subscription. It `acks` messages on success and `nacks` them on failure for redelivery.
-   **Context Store**: The `FirestoreContext` class stores the state for each workflow run as a separate document in a Firestore collection, using `runId` as the document ID.
-   **Coordination Store**: The `RedisCoordinationStore` uses atomic Redis commands (`INCR`, `SETNX`) to manage distributed locks and counters for fan-in joins.

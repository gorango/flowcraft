# Flowcraft Adapter for Kafka & Cassandra

[![NPM Version](https://img.shields.io/npm/v/@flowcraft/kafka-adapter.svg)](https://www.npmjs.com/package/@flowcraft/kafka-adapter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This package provides a distributed adapter for [Flowcraft](https://www.npmjs.com/package/flowcraft) designed for high-throughput environments. It uses Apache Kafka for streaming job processing, Apache Cassandra for scalable and fault-tolerant state persistence, and Redis for high-performance coordination.

## Features

- **High-Throughput Execution**: Built for demanding workloads by leveraging the performance of Kafka and Cassandra.
- **Streaming Job Processing**: Uses Apache Kafka to manage the flow of jobs as a continuous stream of events.
- **Fault-Tolerant State**: Leverages Apache Cassandra's distributed architecture to ensure workflow context is highly available and durable.
- **High-Performance Coordination**: Uses Redis for atomic operations required for complex patterns like fan-in joins.
- **Workflow Reconciliation**: Includes a reconciler utility to detect and resume stalled workflows, ensuring fault tolerance in production environments.

## Installation

You need to install the core `flowcraft` package along with this adapter and its peer dependencies.

```bash
npm install flowcraft @flowcraft/kafka-adapter kafkajs cassandra-driver ioredis
```

## Prerequisites

To use this adapter, you must have the following infrastructure provisioned:
- An Apache Kafka cluster with a topic for jobs.
- An Apache Cassandra cluster with a keyspace and two tables (one for context, one for status).
- A Redis instance accessible by your workers (required for the coordination store to handle atomic operations like fan-in joins and distributed locking).

**Cassandra Table Schema Example:**
```cql
-- For context data
CREATE TABLE your_keyspace.flowcraft_contexts (
    run_id text PRIMARY KEY,
    context_data text
);

-- For final status
CREATE TABLE your_keyspace.flowcraft_statuses (
    run_id text PRIMARY KEY,
    status_data text,
    updated_at timestamp
);
```

## Usage

The following example shows how to configure and start a worker.

```typescript
import { KafkaAdapter, RedisCoordinationStore } from '@flowcraft/kafka-adapter'
import { Client as CassandraClient } from 'cassandra-driver'
import { FlowRuntime } from 'flowcraft'
import Redis from 'ioredis'
import { Kafka } from 'kafkajs'

// 1. Define your workflow blueprints and registry
const blueprints = { /* your workflow blueprints */ }
const registry = { /* your node implementations */ }

// 2. Initialize service clients
const kafka = new Kafka({ brokers: ['kafka-broker:9092'] })
const cassandraClient = new CassandraClient({
	contactPoints: ['cassandra-node:9042'],
	localDataCenter: 'datacenter1',
})
const redisClient = new Redis('YOUR_REDIS_CONNECTION_STRING')

// 3. Create a runtime configuration
const runtime = new FlowRuntime({ blueprints, registry })

// 4. Set up the coordination store
const coordinationStore = new RedisCoordinationStore(redisClient)

// 5. Initialize the adapter
const adapter = new KafkaAdapter({
	runtimeOptions: runtime.options,
	coordinationStore,
	kafka,
	cassandraClient,
	keyspace: 'your_keyspace',
	contextTableName: 'flowcraft_contexts',
	statusTableName: 'flowcraft_statuses',
	topicName: 'flowcraft-jobs', // Optional
	groupId: 'flowcraft-workers', // Optional
})

// 6. Start the worker to connect to Kafka and begin consuming jobs
adapter.start()

console.log('Flowcraft worker with Kafka adapter is running...')
```

## Components

- **`KafkaAdapter`**: The main adapter class that connects to Kafka as a consumer and producer, processes jobs with the `FlowRuntime`, and sends new jobs to the topic.
- **`CassandraContext`**: An `IAsyncContext` implementation that stores and retrieves workflow state as a JSON blob in a Cassandra table.
- **`RedisCoordinationStore`**: An `ICoordinationStore` implementation that uses Redis for atomic operations.
- **`createKafkaReconciler`**: A utility function for creating a reconciler that queries Cassandra for stalled workflows and resumes them.

## Reconciliation

The Kafka adapter includes a reconciliation utility that helps detect and resume stalled workflows. This is particularly useful in production environments where workers might crash or be restarted.

### Prerequisites for Reconciliation

To use reconciliation, your status table must include `status` and `updated_at` fields that track workflow state. The adapter automatically updates these fields during job processing.

### Usage

```typescript
import { createKafkaReconciler } from '@flowcraft/kafka-adapter'

// Create a reconciler instance
const reconciler = createKafkaReconciler({
  adapter: myKafkaAdapter,
  cassandraClient: myCassandraClient,
  keyspace: 'my_keyspace',
  statusTableName: 'flowcraft_statuses',
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

The reconciler queries the status table for workflows with `status = 'running'` that haven't been updated within the threshold period. For each stalled workflow, it:

1. Loads the workflow's current state from the context table
2. Determines which nodes are ready to execute based on completed predecessors
3. Acquires appropriate locks to prevent race conditions
4. Sends jobs for ready nodes to the Kafka topic

This ensures that workflows can be resumed even after worker failures or restarts.

**Note**: The query uses `ALLOW FILTERING` which may be inefficient on large datasets. For production use, consider adding a secondary index on the `status` column.

## License

This package is licensed under the [MIT License](LICENSE).

# Flowcraft Adapter for RabbitMQ & PostgreSQL

[![NPM Version](https://img.shields.io/npm/v/@flowcraft/rabbitmq-adapter.svg)](https://www.npmjs.com/package/@flowcraft/rabbitmq-adapter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This package provides a distributed adapter for [Flowcraft](https://www.npmjs.com/package/flowcraft) that leverages a traditional and reliable enterprise messaging stack. It uses RabbitMQ for message-based job queuing, PostgreSQL for transactional state persistence, and Redis for high-performance coordination.

## Features

- **Distributed Execution**: Run workflows across multiple workers with a battle-tested messaging system.
- **Reliable Job Queuing**: Uses RabbitMQ to manage jobs, offering features like persistence, acknowledgements, and flexible routing.
- **Transactional State**: Leverages PostgreSQL's robustness and JSONB support to store workflow context in a structured, reliable, and queryable manner.
- **High-Performance Coordination**: Uses Redis for atomic operations required for complex patterns like fan-in joins.
- **Workflow Reconciliation**: Includes a reconciler utility to detect and resume stalled workflows, ensuring fault tolerance in production environments.

## Installation

You need to install the core `flowcraft` package along with this adapter and its peer dependencies.

```bash
npm install flowcraft @flowcraft/rabbitmq-adapter amqplib pg ioredis
# Also install types for a better development experience
npm install --save-dev @types/amqplib @types/pg
```

## Prerequisites

To use this adapter, you must have the following infrastructure set up:
- A RabbitMQ server with a queue for jobs.
- A PostgreSQL database with a user and two tables (one for context, one for status).
- A Redis instance accessible by your workers (required for the coordination store to handle atomic operations like fan-in joins and distributed locking).

**PostgreSQL Table Schema Example:**
```sql
-- For context data
CREATE TABLE flowcraft_contexts (
    run_id TEXT PRIMARY KEY,
    context_data JSONB NOT NULL
);

-- For final status
CREATE TABLE flowcraft_statuses (
    run_id TEXT PRIMARY KEY,
    status_data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Usage

The following example demonstrates how to set up and start a worker.

```typescript
import { RabbitMqAdapter, RedisCoordinationStore } from '@flowcraft/rabbitmq-adapter'
import amqplib from 'amqplib'
import { FlowRuntime } from 'flowcraft'
import Redis from 'ioredis'
import { Client as PgClient } from 'pg'

async function main() {
	// 1. Define your workflow blueprints and registry
	const blueprints = { /* your workflow blueprints */ }
	const registry = { /* your node implementations */ }

	// 2. Initialize service clients
	const amqpConnection = await amqplib.connect('amqp://localhost')
	const pgClient = new PgClient({ connectionString: 'postgresql://user:pass@host:5432/db' })
	await pgClient.connect()
	const redisClient = new Redis('YOUR_REDIS_CONNECTION_STRING')

	// 3. Create a runtime configuration
	const runtime = new FlowRuntime({ blueprints, registry })

	// 4. Set up the coordination store
	const coordinationStore = new RedisCoordinationStore(redisClient)

	// 5. Initialize the adapter
	const adapter = new RabbitMqAdapter({
		runtimeOptions: runtime.options,
		coordinationStore,
		amqpConnection,
		pgClient,
		contextTableName: 'flowcraft_contexts',
		statusTableName: 'flowcraft_statuses',
		queueName: 'flowcraft-jobs', // Optional
	})

	// 6. Start the worker to begin consuming jobs
	adapter.start()

	console.log('Flowcraft worker with RabbitMQ adapter is running...')
}

main().catch(console.error)
```

## Components

- **`RabbitMqAdapter`**: The main adapter class that connects to RabbitMQ, consumes jobs from a queue, executes them using the `FlowRuntime`, and publishes new jobs.
- **`PostgresContext`**: An `IAsyncContext` implementation that stores and retrieves workflow state from a JSONB column in a PostgreSQL table.
- **`RedisCoordinationStore`**: An `ICoordinationStore` implementation that uses Redis for atomic operations.
- **`createRabbitMqReconciler`**: A utility function for creating a reconciler that queries PostgreSQL for stalled workflows and resumes them.

## Reconciliation

The RabbitMQ adapter includes a reconciliation utility that helps detect and resume stalled workflows. This is particularly useful in production environments where workers might crash or be restarted.

### Prerequisites for Reconciliation

To use reconciliation, your status table must include `status` and `updated_at` fields that track workflow state. The adapter automatically updates these fields during job processing.

### Usage

```typescript
import { createRabbitMqReconciler } from '@flowcraft/rabbitmq-adapter'

// Create a reconciler instance
const reconciler = createRabbitMqReconciler({
  adapter: myRabbitMqAdapter,
  pgClient: myPgClient,
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
4. Publishes jobs for ready nodes to the RabbitMQ queue

This ensures that workflows can be resumed even after worker failures or restarts.

## License

This package is licensed under the [MIT License](LICENSE).

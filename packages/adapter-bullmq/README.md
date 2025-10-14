# Flowcraft Adapter for BullMQ

[![NPM Version](https://img.shields.io/npm/v/@flowcraft/bullmq-adapter.svg)](https://www.npmjs.com/package/@flowcraft/bullmq-adapter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This package provides a distributed adapter for [Flowcraft](https://www.npmjs.com/package/flowcraft) that leverages BullMQ. It uses Redis for highly efficient job queuing, state persistence, and coordination, making it a powerful and streamlined choice for distributed workflows.

## Features

- **Distributed Execution**: Run your workflows across a fleet of workers with ease.
- **High-Performance Job Queuing**: Built on BullMQ, it offers a robust and fast job queue system powered by Redis.
- **Centralized State Persistence**: Uses Redis Hashes to store and manage workflow context, ensuring data is consistent across all workers.
- **Integrated Coordination**: Leverages Redis's atomic commands for all coordination tasks, including fan-in joins and distributed locking.

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

## License

This package is licensed under the [MIT License](LICENSE).

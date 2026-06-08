# @flowcraft/cloudflare-adapter

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/@flowcraft/cloudflare-adapter.svg)](https://www.npmjs.com/package/@flowcraft/cloudflare-adapter)
[![Codecov](https://img.shields.io/codecov/c/github/gorango/flowcraft/master?flag=adapter-cloudflare)](https://codecov.io/github/gorango/flowcraft/tree/master/packages/adapter-cloudflare/src?flags[0]=adapter-cloudflare)

A distributed adapter for [Flowcraft](https://www.npmjs.com/package/flowcraft) that uses Cloudflare Queues, Durable Objects, and KV for workflow execution in Cloudflare Workers.

## Installation

```bash
npm install @flowcraft/cloudflare-adapter
```

## Features

- **Distributed Execution** - Run workflows across multiple Cloudflare Workers with reliable job distribution
- **Durable State** - Workflow state persists in Durable Objects, surviving worker restarts
- **Atomic Coordination** - Support for "all" and "any" join strategies with atomic distributed coordination via Durable Objects
- **Workflow Reconciliation** - Automatically detect and resume stalled workflows
- **Status Tracking** - Real-time workflow status updates in KV
- **TypeScript Support** - Full TypeScript support with type definitions included

## Prerequisites

- Cloudflare Workers account
- Cloudflare Queues enabled
- Cloudflare KV namespace for status tracking
- Durable Object for context and atomic coordination

## Usage

### 1. Set up your Cloudflare resources

```bash
# Create a KV namespace for status
wrangler kv:namespace create "flowcraft-status"

# Create a queue
wrangler queues create "flowcraft-jobs"

# Define a Durable Object class in your Worker (see Durable Object Setup)
```

### 2. Configure your Worker

```typescript
// wrangler.toml
name = 'flowcraft-worker'
main = 'src/index.ts'
compatibility_date = '2024-01-01'[[kv_namespaces]]
binding = 'STATUS'
id = 'your-status-namespace-id'[[queues]]
binding = 'JOBS'
queue = 'flowcraft-jobs'
```

### 3. Create the adapter

```typescript
import {
	CloudflareQueueAdapter,
	DurableObjectCoordinationStore,
} from '@flowcraft/cloudflare-adapter'

export interface Env {
	STATUS: KVNamespace
	JOBS: Queue
}

// Note: In a real Worker, you'd get the Durable Object stub from env
const mockStorage = {
	/* your Durable Object storage */
}

// Use DurableObjectCoordinationStore for atomic fan-in joins
const coordinationStore = new DurableObjectCoordinationStore({
	namespace: mockStorage,
})

const adapter = new CloudflareQueueAdapter({
	runtimeOptions: {
		blueprints,
		registry,
	},
	coordinationStore,
	queue: env.JOBS,
	durableObjectStorage: mockStorage,
	statusKVNamespace: env.STATUS,
	queueName: 'flowcraft-jobs',
})
```

### 4. Handle queue messages

```typescript
export default {
	async queue(batch: MessageBatch, env: Env): Promise<void> {
		for (const message of batch.messages) {
			try {
				const job = message.body as JobPayload
				await adapter.handleJob(job)
				message.ack()
			} catch (error) {
				console.error('Failed to process job:', error)
				message.nack()
			}
		}
	},
}
```

## Reconciliation

The Cloudflare adapter includes a reconciliation utility that helps detect and resume stalled workflows. This is particularly useful in production environments where workers might crash or be restarted.

### Prerequisites for Reconciliation

To use reconciliation, your status KV namespace must include a `lastUpdated` field that tracks when workflows were last active. The adapter automatically updates this field during job processing.

### Usage

```typescript
import { createCloudflareReconciler } from '@flowcraft/cloudflare-adapter'

const reconciler = createCloudflareReconciler({
	adapter: myCloudflareAdapter,
	statusKVNamespace: env.STATUS,
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
	stalledRuns: number // Number of workflows identified as stalled
	reconciledRuns: number // Number of workflows successfully resumed
	failedRuns: number // Number of reconciliation attempts that failed
}
```

### How It Works

The reconciler queries the status KV namespace for workflows with `status = 'running'` that haven't been updated within the threshold period. For each stalled workflow, it:

1. Loads the workflow's current state from the Durable Object context
2. Determines which nodes are ready to execute based on completed predecessors
3. Acquires appropriate locks to prevent race conditions
4. Enqueues jobs for ready nodes via Cloudflare Queues

This ensures that workflows can be resumed even after worker failures or restarts.

## API

### CloudflareQueueAdapter

The main adapter class for distributed workflow execution.

#### Constructor Options

- `runtimeOptions` - Flowcraft runtime options (blueprints, registry, etc.)
- `coordinationStore` - Durable Object-based coordination store for atomic distributed locking
- `queue` - Cloudflare Queue for job distribution
- `durableObjectStorage` - Durable Object storage for context persistence
- `statusKVNamespace` - KV namespace for workflow status tracking
- `queueName` - Name of the Cloudflare Queue

#### Methods

- `handleJob(job)` - Process a single job from the queue (use in your queue handler)
- `reconcile(runId)` - Reconcile a workflow run after interruption

### DurableObjectContext

A distributed context implementation using Durable Object storage.

```typescript
const context = new DurableObjectContext('run-123', {
	storage: durableObjectStorage,
	runId: 'run-123',
})
```

## Architecture

### Job Queue

Uses Cloudflare Queues for reliable job distribution. The adapter enqueues jobs when workflow nodes are ready to execute.

### State Persistence

Uses Durable Objects for context storage. Each workflow run has its own Durable Object that maintains the complete workflow state.

### Coordination

Uses Durable Objects for atomic distributed coordination:

- Atomic fan-in join counting
- Atomic distributed locking for "any" joins

### Status Tracking

Uses a separate KV namespace to track workflow status, including:

- Current status (running, completed, failed)
- Last updated timestamp
- Final result when complete

## Differences from Other Adapters

Unlike other Flowcraft adapters that use Docker-based Testcontainers for testing, the Cloudflare adapter:

1. Uses Miniflare for local development and testing
2. Requires Cloudflare-specific runtime environments
3. Uses Durable Objects for coordination instead of Redis/DynamoDB
4. Uses Durable Objects for context instead of database tables

## License

This package is licensed under the [MIT License](https://github.com/gorango/flowcraft/blob/master/LICENSE).

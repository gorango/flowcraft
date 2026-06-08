# Flowcraft Adapter for Vercel

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/@flowcraft/vercel-adapter.svg)](https://www.npmjs.com/package/@flowcraft/vercel-adapter)
[![Codecov](https://img.shields.io/codecov/c/github/gorango/flowcraft/master?flag=adapter-vercel)](https://codecov.io/github/gorango/flowcraft/tree/master/packages/adapter-vercel/src?flags[0]=adapter-vercel)

This package provides a distributed adapter for [Flowcraft](https://www.npmjs.com/package/flowcraft) that is deeply integrated with Vercel's serverless infrastructure. It uses **Vercel Queues** for event-driven job queuing and **Redis** (e.g., Upstash via Vercel Marketplace) for scalable state persistence and coordination.

## Features

- **Serverless Execution**: No persistent workers needed. Each job is processed by a Vercel Function triggered by the queue.
- **Event-Driven Queues**: Utilizes Vercel Queues for durable, at-least-once message delivery with automatic retries.
- **Redis State & Coordination**: Leverages Redis for workflow context, distributed coordination (fan-in joins), and status tracking.
- **Workflow Reconciliation**: Includes a reconciler utility to detect and resume stalled workflows.

## Installation

```bash
npm install flowcraft @flowcraft/vercel-adapter @vercel/queue ioredis
```

## Prerequisites

- A Vercel project with the Queues feature enabled.
- A Redis instance (e.g., Upstash Redis via Vercel Marketplace).
- Node.js 22+ (required by `@vercel/queue`).

## Usage

### Queue Consumer (Worker)

```typescript
// app/api/workflow-worker/route.ts
import { handleCallback } from '@vercel/queue'
import Redis from 'ioredis'
import { VercelQueueAdapter, VercelKvCoordinationStore } from '@flowcraft/vercel-adapter'

const redis = new Redis(process.env.UPSTASH_REDIS_URL!)

const coordinationStore = new VercelKvCoordinationStore({ client: redis })

const adapter = new VercelQueueAdapter({
	redisClient: redis,
	topicName: 'flowcraft-jobs',
	coordinationStore,
	runtimeOptions: {
		blueprints: {
			/* your blueprints */
		},
		registry: {
			/* your node implementations */
		},
	},
})

export const POST = handleCallback(async (message) => {
	await adapter.handleJob(message)
})
```

### vercel.json Configuration

```json
{
	"functions": {
		"app/api/workflow-worker/route.ts": {
			"experimentalTriggers": [{ "type": "queue/v2beta", "topic": "flowcraft-jobs" }]
		}
	}
}
```

### Starting a Workflow (Producer)

```typescript
import { analyzeBlueprint } from 'flowcraft'
import { send } from '@vercel/queue'
import Redis from 'ioredis'

const redis = new Redis(process.env.UPSTASH_REDIS_URL!)

async function startWorkflow(blueprint, initialContext) {
	const runId = crypto.randomUUID()

	// Set initial context
	const prefix = 'flowcraft:context:'
	await redis.set(`${prefix}${runId}:blueprintId`, blueprint.id, 'EX', 86400)

	// Set status
	await redis.set(
		`flowcraft:status:${runId}`,
		JSON.stringify({
			status: 'running',
			lastUpdated: Math.floor(Date.now() / 1000),
		}),
		'EX',
		86400,
	)

	// Enqueue start nodes
	const analysis = analyzeBlueprint(blueprint)
	for (const nodeId of analysis.startNodeIds) {
		await send('flowcraft-jobs', { runId, blueprintId: blueprint.id, nodeId })
	}

	return runId
}
```

## Components

- **`VercelQueueAdapter`**: The main adapter class for serverless execution via Vercel Queues. Exposes `handleJob()` for per-invocation processing.
- **`VercelKvContext`**: An `IAsyncContext` implementation for storing workflow state in Redis.
- **`VercelKvCoordinationStore`**: An `ICoordinationStore` implementation for distributed locks and counters using Redis.
- **`createVercelReconciler`**: A utility function for creating a reconciler that queries Redis for stalled workflows and resumes them.

## Reconciliation

```typescript
import { createVercelReconciler } from '@flowcraft/vercel-adapter'

const reconciler = createVercelReconciler({
	adapter: myAdapter,
	redisClient: myRedisClient,
	statusKeyPrefix: 'flowcraft:status:',
	stalledThresholdSeconds: 300,
})

const stats = await reconciler.run()
console.log(`Reconciled ${stats.reconciledRuns} of ${stats.stalledRuns} stalled runs`)
```

## License

This package is licensed under the [MIT License](https://github.com/gorango/flowcraft/blob/master/LICENSE).

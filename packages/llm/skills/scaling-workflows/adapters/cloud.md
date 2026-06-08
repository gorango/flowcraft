# Cloud Adapters

## GCP Cloud Tasks

```typescript
import { GCPAdapter } from '@flowcraft/adapter-gcp'

const adapter = new GCPAdapter({
	projectId: process.env.GCP_PROJECT_ID,
	location: 'us-central1',
	queueName: 'workflow-queue',
})
```

## Azure Service Bus

```typescript
import { AzureAdapter } from '@flowcraft/adapter-azure'

const adapter = new AzureAdapter({
	connectionString: process.env.AZURE_SERVICE_BUS_CONNECTION,
	queueName: 'workflow-queue',
})
```

## Kafka

```typescript
import { KafkaAdapter } from '@flowcraft/adapter-kafka'

const adapter = new KafkaAdapter({
	brokers: ['localhost:9092'],
	topic: 'flowcraft-tasks',
	groupId: 'flowcraft-workers',
})
```

## Cloudflare Workers

```typescript
import { CloudflareAdapter } from '@flowcraft/adapter-cloudflare'

const adapter = new CloudflareAdapter({
	queueName: 'workflow-queue',
})
```

## Vercel

```typescript
import { VercelAdapter } from '@flowcraft/adapter-vercel'

const adapter = new VercelAdapter({
	queueName: 'workflow-queue',
	redisUrl: process.env.REDIS_URL,
})
```

**Key features:**

- Serverless Next.js integration
- Vercel Queues for job dispatch
- Redis-backed context and coordination
- Ideal for Vercel-hosted applications

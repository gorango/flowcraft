# Adapter Configuration

## BullMQ (Redis)

```typescript
import { BullMQAdapter } from '@flowcraft/adapter-bullmq'

const adapter = new BullMQAdapter({
	connection: {
		host: 'localhost',
		port: 6379,
		password: process.env.REDIS_PASSWORD,
	},
	prefix: 'flowcraft',
	concurrency: 10,
})

const result = await adapter.run(blueprint, initialState, {
	functionRegistry,
	maxConcurrency: 10,
})
```

**Key features:**

- Redis-backed job queue with persistence
- Automatic retry with configurable backoff
- Rate limiting support
- Priority queues

## SQS (AWS)

```typescript
import { SQSAdapter } from '@flowcraft/adapter-sqs'

const adapter = new SQSAdapter({
	queueUrl: process.env.SQS_QUEUE_URL,
	region: process.env.AWS_REGION,
	visibilityTimeout: 30,
	waitTimeSeconds: 20,
})

const result = await adapter.run(blueprint, initialState, {
	functionRegistry,
})
```

**Key features:**

- Fully managed AWS queue
- Long polling support
- Dead-letter queue integration
- IAM-based authentication

## RabbitMQ

```typescript
import { RabbitMQAdapter } from '@flowcraft/adapter-rabbitmq'

const adapter = new RabbitMQAdapter({
	url: 'amqp://localhost:5672',
	exchange: 'flowcraft',
	queue: 'workflow-tasks',
	prefetch: 10,
})

const result = await adapter.run(blueprint, initialState, {
	functionRegistry,
})
```

**Key features:**

- AMQP protocol support
- Flexible routing with exchanges
- Message acknowledgment
- Dead letter exchanges

## Cloud adapters

### GCP Cloud Tasks

```typescript
import { GCPAdapter } from '@flowcraft/adapter-gcp'

const adapter = new GCPAdapter({
	projectId: process.env.GCP_PROJECT_ID,
	location: 'us-central1',
	queueName: 'workflow-queue',
})
```

### Azure Service Bus

```typescript
import { AzureAdapter } from '@flowcraft/adapter-azure'

const adapter = new AzureAdapter({
	connectionString: process.env.AZURE_SERVICE_BUS_CONNECTION,
	queueName: 'workflow-queue',
})
```

### Kafka

```typescript
import { KafkaAdapter } from '@flowcraft/adapter-kafka'

const adapter = new KafkaAdapter({
	brokers: ['localhost:9092'],
	topic: 'flowcraft-tasks',
	groupId: 'flowcraft-workers',
})
```

### Cloudflare Workers

```typescript
import { CloudflareAdapter } from '@flowcraft/adapter-cloudflare'

const adapter = new CloudflareAdapter({
	queueName: 'workflow-queue',
})
```

## Adapter architecture

All adapters extend `BaseDistributedAdapter`:

```typescript
abstract class BaseDistributedAdapter {
	abstract createContext(): Promise<CoordinationContext>
	abstract processJobs(options: ProcessOptions): Promise<void>
	abstract enqueueJob(job: JobDefinition): Promise<void>
	abstract publishFinalResult(result: WorkflowResult): Promise<void>
}
```

### Coordination store

Distributed adapters use a coordination store to track:

- Node execution status
- Fan-in join locks
- Poison pills for failed nodes
- Context deltas

### Running distributed workflows

```typescript
// Worker process (runs continuously)
const adapter = new BullMQAdapter({ connection })
await adapter.processJobs({
	functionRegistry,
	maxConcurrency: 10,
})

// Submit workflow (any process)
const result = await adapter.run(blueprint, initialState, {
	functionRegistry,
})
```

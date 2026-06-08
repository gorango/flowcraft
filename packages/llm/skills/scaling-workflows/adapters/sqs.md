# SQS Adapter

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

**Configuration options:**

- `queueUrl`: SQS queue URL
- `region`: AWS region
- `visibilityTimeout`: Seconds a message is invisible after being received
- `waitTimeSeconds`: Long polling wait time (0-20)

# RabbitMQ Adapter

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

**Configuration options:**

- `url`: AMQP connection string
- `exchange`: Exchange name for routing
- `queue`: Queue name for task consumption
- `prefetch`: Number of unacknowledged messages per worker

# Distributed Execution: Official Adapters

Flowcraft's progressive scalability is enabled by its adapter-based architecture. You can develop your workflow's business logic once and then deploy it to different distributed systems by simply swapping in the appropriate adapter.

Each adapter provides the necessary components to bridge Flowcraft's core runtime with specific message queues, databases, and coordination stores.

## Officially Supported Adapters

| Package | Queue | Context Store | Coordination Store | Ideal For |
| :--- | :--- | :--- | :--- | :--- |
| **[@flowcraft/bullmq-adapter](/guide/adapters/bullmq)** | BullMQ (Redis) | Redis | Redis | High-performance, all-in-one Redis stack. |
| **[@flowcraft/sqs-adapter](/guide/adapters/sqs)** | AWS SQS | DynamoDB | DynamoDB | Fully native, serverless-friendly AWS stack. |
| **[@flowcraft/gcp-adapter](/guide/adapters/gcp)** | Google Pub/Sub | Firestore | Redis | Native Google Cloud integration. |
| **[@flowcraft/azure-adapter](/guide/adapters/azure)** | Azure Queues | Cosmos DB | Redis | Native Microsoft Azure integration. |
| **[@flowcraft/rabbitmq-adapter](/guide/adapters/rabbitmq)** | RabbitMQ | PostgreSQL | Redis | Classic, reliable enterprise messaging stack. |
| **[@flowcraft/kafka-adapter](/guide/adapters/kafka)** | Apache Kafka | Cassandra | Redis | Extreme-scale, high-throughput streaming. |

> [!TIP]
> **Building Your Own Adapter**
>
> If your preferred infrastructure isn't listed, you can easily create your own. See the [Distributed Execution](/guide/distributed-execution) guide for details on the `BaseDistributedAdapter` pattern.

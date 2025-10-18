# Best Practices

This guide provides best practices for designing efficient, scalable workflows in Flowcraft, especially when transitioning from simple to complex setups. Following these recommendations helps avoid common pitfalls in distributed systems, improves performance, and ensures maintainability.

## Node Granularity

Deciding how to structure nodes is crucial for workflow clarity and reusability. Aim for a balance between simplicity and modularity.

### Guidelines
- **Single Responsibility**: Each node should handle one primary task. For example, use separate nodes for data fetching, processing, and saving rather than combining them into a monolithic node.
- **Avoid Overloading**: Large nodes that perform multiple unrelated operations can complicate debugging, testing, and error handling. For testing strategies, see [Testing and Debugging](/guide/testing).
- **Leverage Subflows**: For complex logic, break it into subflows (see [Subflows](/guide/subflows)) to create composable, reusable components.

### Example
Consider a workflow for processing user data:

```typescript
// Poor: Monolithic node
const processUserNode = {
  async execute(context) {
    const data = await fetchData(context.userId); // Fetch
    const processed = processData(data); // Process
    await saveData(processed); // Save
    return processed;
  }
};

// Better: Granular nodes
const fetchUserNode = {
  async execute(context) {
    return await fetchData(context.userId);
  }
};

const processUserNode = {
  async execute(context) {
    return processData(context.data);
  }
};

const saveUserNode = {
  async execute(context) {
    await saveData(context.processedData);
  }
};
```

Granular nodes allow for independent testing, easier retries, and better parallelism.

## Context Management

In distributed systems, context is serialized and transmitted between nodes or workers, impacting performance and costs.

### Guidelines
- **Minimize Data**: Include only essential information in the context, such as IDs or small metadata. Avoid embedding large objects, full datasets, or unnecessary state.
- **Use References**: For heavy data, use lazy loading or external references (e.g., via adapters) to fetch data on-demand.
- **Profile and Optimize**: Monitor context size in distributed setups to reduce serialization overhead.

### Example
In a RAG workflow (see [RAG Agent Example](/examples/5_rag)):

```typescript
// Poor: Large context
const context = {
  documents: fullDocumentArray, // Large data
  query: 'search query'
};

// Better: Minimal context
const context = {
  documentIds: ['id1', 'id2'], // Small references
  query: 'search query'
};

// Fetch documents in the node if needed
const ragNode = {
  async execute(context) {
    const documents = await fetchDocuments(context.documentIds);
    // Process query with documents
  }
};
```

This reduces network costs and improves scalability.

## Idempotency

Node logic should be idempotent in distributed environments, where retries are common due to failures or load balancing.

### Guidelines
- **Consistent Results**: Ensure repeated executions with the same input produce the same output.
- **Handle Side Effects**: Use atomic operations or checks for existing results (e.g., unique keys for database writes).
- **Test with Retries**: Simulate failures to verify idempotency.

### Example
For a data ingestion node:

```typescript
const ingestNode = {
  async execute(context) {
    const key = `ingested:${context.dataId}`;
    if (await isAlreadyProcessed(key)) {
      return; // Skip if already done
    }
    await insertData(context.data);
    await markProcessed(key);
  }
};
```

This prevents duplicates during retries.

## Choosing an Adapter

Select a distributed adapter based on your infrastructure, scale, and requirements. Here's a high-level comparison:

| Adapter | Best For | Pros | Cons | Example Use Case |
|---|---|---|---|---|
| [BullMQ](/guide/adapters/bullmq) | In-memory/Redis queues | Simple, low latency | Limited to Redis ecosystem | Real-time task processing |
| [GCP](/guide/adapters/gcp) | Cloud-native workflows | Scalable, managed services | Vendor lock-in | Serverless distributed jobs |
| [Kafka](/guide/adapters/kafka) | Event-driven systems | High throughput, durability | Complexity in setup | Streaming data pipelines |
| [RabbitMQ](/guide/adapters/rabbitmq) | Message queuing | Reliable, flexible routing | Requires message broker | Decoupled microservices |
| [SQS](/guide/adapters/sqs) | AWS-integrated queues | Managed, cost-effective | AWS-specific | Cloud-based job queues |
| [Azure](/guide/adapters/azure) | Azure ecosystem | Seamless Azure integration | Tied to Azure services | Enterprise Azure workflows |

### Guidelines
- **Start Simple**: Use [BullMQ](/guide/adapters/bullmq) for initial development due to its ease of setup.
- **Scale Up**: Migrate to cloud adapters (e.g., GCP or SQS) for production.
- **Match Patterns**: Choose event-driven adapters like Kafka for high-throughput scenarios.

For detailed setup, see [Official Adapters](/guide/adapters/).

## Conclusion

Applying these best practices will help you build robust, efficient workflows. Experiment with examples (e.g., [Distributed Workflow Example](/examples/4b_declarative-distributed.md)) and use static analysis (see [Static Analysis](/guide/static-analysis)) to validate your designs. For testing and debugging, see [Testing and Debugging](/guide/testing). For more, explore [Error Handling](/guide/error-handling) and [Distributed Execution](/guide/distributed-execution.md).

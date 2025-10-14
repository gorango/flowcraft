# Flowcraft Adapter for AWS SQS & DynamoDB

[![NPM Version](https://img.shields.io/npm/v/@flowcraft/sqs-adapter.svg)](https://www.npmjs.com/package/@flowcraft/sqs-adapter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This package provides a distributed adapter for [Flowcraft](https://www.npmjs.com/package/flowcraft) that is deeply integrated with Amazon Web Services (AWS). It uses AWS Simple Queue Service (SQS) for reliable job queuing and AWS DynamoDB for scalable, low-latency state persistence and coordination.

## Features

- **Distributed Execution**: Natively scale your workflows across multiple workers using managed AWS services.
- **Serverless Job Queuing**: Utilizes AWS SQS for a fully managed message queue that decouples workflow steps.
- **Scalable State & Coordination**: Leverages AWS DynamoDB's performance and scalability for both workflow context persistence and distributed coordination tasks (like fan-in joins), eliminating the need for a separate Redis instance.

## Installation

You need to install the core `flowcraft` package along with this adapter and the required AWS SDK v3 modules.

```bash
npm install flowcraft @flowcraft/sqs-adapter @aws-sdk/client-sqs @aws-sdk/client-dynamodb @aws-sdk/util-dynamodb```

## Prerequisites

To use this adapter, you must have the following AWS resources provisioned:
- An SQS queue to handle jobs.
- Three DynamoDB tables:
    1.  A table to store workflow context.
    2.  A table to store the final status of a workflow run.
    3.  A table for the coordination store (for locks and counters).

**DynamoDB Table Schema Examples:**
- **Context/Status Tables**: Primary key `runId` (String).
- **Coordination Table**: Primary key `coordinationKey` (String). This table should also have a TTL attribute enabled on a `ttl` (Number) field for automatic cleanup of expired locks and counters.

## Usage

The following example demonstrates how to set up and start a worker.

```typescript
import { SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { FlowRuntime } from 'flowcraft';
import { SqsAdapter, DynamoDbCoordinationStore } from '@flowcraft/sqs-adapter';

// 1. Define your workflow blueprints and registry
const blueprints = { /* your workflow blueprints */ };
const registry = { /* your node implementations */ };

// 2. Initialize AWS service clients
const awsConfig = { region: 'us-east-1' };
const sqsClient = new SQSClient(awsConfig);
const dynamoDbClient = new DynamoDBClient(awsConfig);

// 3. Create a runtime configuration
const runtime = new FlowRuntime({ blueprints, registry });

// 4. Set up the coordination store using DynamoDB
const coordinationStore = new DynamoDbCoordinationStore({
  client: dynamoDbClient,
  tableName: 'flowcraft-coordination',
});

// 5. Initialize the adapter
const adapter = new SqsAdapter({
  runtimeOptions: runtime.options,
  coordinationStore,
  sqsClient,
  dynamoDbClient,
  queueUrl: 'YOUR_SQS_QUEUE_URL',
  contextTableName: 'flowcraft-contexts',
  statusTableName: 'flowcraft-statuses',
});

// 6. Start the worker to begin polling the SQS queue
adapter.start();

console.log('Flowcraft worker with SQS adapter is running...');
```

## Components

- **`SqsAdapter`**: The main adapter class that polls an SQS queue for jobs, executes them via the `FlowRuntime`, and enqueues subsequent jobs.
- **`DynamoDbContext`**: An `IAsyncContext` implementation that stores and retrieves workflow state from a specified DynamoDB table.
- **`DynamoDbCoordinationStore`**: An `ICoordinationStore` implementation that uses DynamoDB's atomic update and conditional expression features to handle distributed coordination without needing a separate service.

## License

This package is licensed under the [MIT License](LICENSE).

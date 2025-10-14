import type { StartedLocalStackContainer } from '@testcontainers/localstack'
import type { ICoordinationStore, JobPayload } from 'flowcraft'
import { CreateTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { CreateQueueCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { LocalstackContainer } from '@testcontainers/localstack'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SqsAdapter } from './adapter'

// Test constants
const QUEUE_NAME = 'test-flowcraft-queue'
const CONTEXT_TABLE = 'test-context-table'
const STATUS_TABLE = 'test-status-table'
const REGION = 'us-east-1'

describe('SqsAdapter', () => {
	let container: StartedLocalStackContainer
	let sqsClient: SQSClient
	let dynamoClient: DynamoDBClient
	let queueUrl: string

	// 1. Before tests run, start the LocalStack container and create resources
	beforeAll(async () => {
		container = await new LocalstackContainer('localstack/localstack:latest').start()
		const endpoint = container.getConnectionUri()

		// Instantiate real SDK clients pointed at the running container
		sqsClient = new SQSClient({
			endpoint,
			region: REGION,
			credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
		})

		dynamoClient = new DynamoDBClient({
			endpoint,
			region: REGION,
			credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
		})

		// Create the necessary AWS resources inside the container
		const createQueueResponse = await sqsClient.send(new CreateQueueCommand({ QueueName: QUEUE_NAME }))
		queueUrl = createQueueResponse.QueueUrl!

		const createTable = (TableName: string) =>
			dynamoClient.send(new CreateTableCommand({
				TableName,
				KeySchema: [{ AttributeName: 'runId', KeyType: 'HASH' }],
				AttributeDefinitions: [{ AttributeName: 'runId', AttributeType: 'S' }],
				BillingMode: 'PAY_PER_REQUEST',
			}))

		await createTable(CONTEXT_TABLE)
		await createTable(STATUS_TABLE)
	}, 60000) // Increase timeout for Docker startup and resource creation

	// 2. After all tests are done, stop and remove the container
	afterAll(async () => {
		await container.stop()
	})

	it('should successfully enqueue a job into the LocalStack SQS queue', async () => {
		const adapter = new SqsAdapter({
			sqsClient,
			dynamoDbClient: dynamoClient,
			queueUrl,
			contextTableName: CONTEXT_TABLE,
			statusTableName: STATUS_TABLE,
			coordinationStore: {} as ICoordinationStore, // Mocked for this specific test
			runtimeOptions: {},
		})

		const job: JobPayload = {
			runId: 'run-abc',
			blueprintId: 'bp-1',
			nodeId: 'node-start',
		}

		// ACTION: Call the protected method via a type assertion for testing
		await (adapter as any).enqueueJob(job)

		// VERIFICATION: Use the client to check the state of the SQS service in the container
		const receiveResult = await sqsClient.send(new ReceiveMessageCommand({
			QueueUrl: queueUrl,
			MaxNumberOfMessages: 1,
		}))

		expect(receiveResult.Messages).toHaveLength(1)
		const receivedJob = JSON.parse(receiveResult.Messages![0].Body!)
		expect(receivedJob).toEqual(job)
	})
})

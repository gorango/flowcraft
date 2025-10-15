import { CreateTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { CreateQueueCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import type { StartedLocalStackContainer } from '@testcontainers/localstack'
import { LocalstackContainer } from '@testcontainers/localstack'
import type { ICoordinationStore, JobPayload } from 'flowcraft'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SqsAdapter } from './adapter'

const QUEUE_NAME = 'test-flowcraft-queue'
const CONTEXT_TABLE = 'test-context-table'
const STATUS_TABLE = 'test-status-table'
const REGION = 'us-east-1'

describe('SqsAdapter', () => {
	let container: StartedLocalStackContainer
	let sqsClient: SQSClient
	let dynamoClient: DynamoDBClient
	let queueUrl: string

	beforeAll(async () => {
		container = await new LocalstackContainer('localstack/localstack:latest').start()
		const endpoint = container.getConnectionUri()

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

		const createQueueResponse = await sqsClient.send(new CreateQueueCommand({ QueueName: QUEUE_NAME }))
		queueUrl = createQueueResponse.QueueUrl ?? ''

		const createTable = (TableName: string) =>
			dynamoClient.send(
				new CreateTableCommand({
					TableName,
					KeySchema: [{ AttributeName: 'runId', KeyType: 'HASH' }],
					AttributeDefinitions: [{ AttributeName: 'runId', AttributeType: 'S' }],
					BillingMode: 'PAY_PER_REQUEST',
				}),
			)

		await createTable(CONTEXT_TABLE)
		await createTable(STATUS_TABLE)
	}, 60000)

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
			coordinationStore: {} as ICoordinationStore,
			runtimeOptions: {},
		})

		const job: JobPayload = {
			runId: 'run-abc',
			blueprintId: 'bp-1',
			nodeId: 'node-start',
		}

		await (adapter as any).enqueueJob(job)

		const receiveResult = await sqsClient.send(
			new ReceiveMessageCommand({
				QueueUrl: queueUrl,
				MaxNumberOfMessages: 1,
			}),
		)

		expect(receiveResult.Messages).toHaveLength(1)
		const receivedJob = JSON.parse(receiveResult.Messages?.[0].Body ?? '{}')
		expect(receivedJob).toEqual(job)
	})
})

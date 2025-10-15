import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import type { SQSClient } from '@aws-sdk/client-sqs'
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand } from '@aws-sdk/client-sqs'
import type { AdapterOptions, JobPayload, WorkflowResult } from 'flowcraft'
import { BaseDistributedAdapter } from 'flowcraft'
import { DynamoDbContext } from './context'

export interface SqsAdapterOptions extends AdapterOptions {
	sqsClient: SQSClient
	dynamoDbClient: DynamoDBClient
	queueUrl: string
	contextTableName: string
	statusTableName: string
}

/**
 * A distributed adapter for Flowcraft that uses AWS SQS for job queuing
 * and DynamoDB for state and coordination.
 */
export class SqsAdapter extends BaseDistributedAdapter {
	private readonly sqs: SQSClient
	private readonly dynamo: DynamoDBClient
	private readonly queueUrl: string
	private readonly contextTableName: string
	private readonly statusTableName: string
	private isPolling = false

	constructor(options: SqsAdapterOptions) {
		super(options)
		this.sqs = options.sqsClient
		this.dynamo = options.dynamoDbClient
		this.queueUrl = options.queueUrl
		this.contextTableName = options.contextTableName
		this.statusTableName = options.statusTableName
		console.log(`[SqsAdapter] Initialized for queue: ${this.queueUrl}`)
	}

	protected createContext(runId: string): DynamoDbContext {
		return new DynamoDbContext(runId, {
			client: this.dynamo,
			tableName: this.contextTableName,
		})
	}

	/**
	 * Hook called at the start of job processing to update lastUpdated timestamp.
	 */
	protected async onJobStart(_runId: string, _blueprintId: string, _nodeId: string): Promise<void> {
		// Touch the status table to update the 'lastUpdated' timestamp.
		// This is critical for the reconciler to find stalled workflows.
		try {
			const touchCommand = new UpdateItemCommand({
				TableName: this.statusTableName,
				Key: { runId: { S: _runId } },
				UpdateExpression: 'SET #lu = :lu, #s = if_not_exists(#s, :init)',
				ExpressionAttributeNames: {
					'#lu': 'lastUpdated',
					'#s': 'status',
				},
				ExpressionAttributeValues: {
					':lu': { N: Math.floor(Date.now() / 1000).toString() },
					':init': { S: 'running' },
				},
			})
			await this.dynamo.send(touchCommand)
		} catch (error) {
			console.error(`[SqsAdapter] Failed to update lastUpdated timestamp for Run ID ${_runId}`, error)
		}
	}

	protected async enqueueJob(job: JobPayload): Promise<void> {
		const command = new SendMessageCommand({
			QueueUrl: this.queueUrl,
			MessageBody: JSON.stringify(job),
		})
		await this.sqs.send(command)
	}

	protected async publishFinalResult(
		runId: string,
		result: { status: string; payload?: WorkflowResult; reason?: string },
	): Promise<void> {
		// In a real application, you might use DynamoDB Streams + Lambda
		// to push this result to a client. For this adapter, we just store it.
		const store = new DynamoDbContext(runId, {
			client: this.dynamo,
			tableName: this.statusTableName,
		})
		// Also update 'lastUpdated' when publishing the final result
		await store.set('finalStatus', { ...result, lastUpdated: Math.floor(Date.now() / 1000) })
		console.log(`[SqsAdapter] Published final result for Run ID ${runId}.`)
	}

	protected processJobs(handler: (job: JobPayload) => Promise<void>): void {
		if (this.isPolling) {
			console.warn('[SqsAdapter] Polling is already active.')
			return
		}
		this.isPolling = true
		console.log('[SqsAdapter] Worker starting to poll for jobs...')
		this.poll(handler)
	}

	private async poll(handler: (job: JobPayload) => Promise<void>): Promise<void> {
		while (this.isPolling) {
			try {
				const command = new ReceiveMessageCommand({
					QueueUrl: this.queueUrl,
					MaxNumberOfMessages: 10,
					WaitTimeSeconds: 20, // use long polling
				})

				const { Messages } = await this.sqs.send(command)

				if (Messages && Messages.length > 0) {
					await Promise.all(
						Messages.map(async (message) => {
							if (message.Body) {
								try {
									const job = JSON.parse(message.Body) as JobPayload
									console.log(`[SqsAdapter] ==> Picked up job for Node: ${job.nodeId}, Run: ${job.runId}`)
									await handler(job)
								} catch (err) {
									console.error('[SqsAdapter] Error processing message body:', err)
								} finally {
									const deleteCommand = new DeleteMessageCommand({
										QueueUrl: this.queueUrl,
										ReceiptHandle: message.ReceiptHandle,
									})
									await this.sqs.send(deleteCommand)
								}
							}
						}),
					)
				}
			} catch (error) {
				console.error('[SqsAdapter] Error during SQS polling:', error)
				// wait before retrying to prevent rapid-fire errors
				await new Promise((resolve) => setTimeout(resolve, 5000))
			}
		}
	}

	public stop(): void {
		console.log('[SqsAdapter] Stopping worker polling.')
		this.isPolling = false
	}
}

import { Buffer } from 'node:buffer'
import type { CosmosClient } from '@azure/cosmos'
import type { QueueClient } from '@azure/storage-queue'
import type { AdapterOptions, JobPayload, WorkflowResult } from 'flowcraft'
import { BaseDistributedAdapter } from 'flowcraft'
import { CosmosDbContext } from './context'

export interface AzureQueueAdapterOptions extends AdapterOptions {
	queueClient: QueueClient
	cosmosClient: CosmosClient
	cosmosDatabaseName: string
	contextContainerName: string
	statusContainerName: string
}

/**
 * A distributed adapter for Flowcraft that uses Azure Queue Storage and Cosmos DB.
 */
export class AzureQueueAdapter extends BaseDistributedAdapter {
	private readonly queueClient: QueueClient
	private readonly cosmosClient: CosmosClient
	private readonly cosmosDatabaseName: string
	private readonly contextContainerName: string
	private readonly statusContainerName: string
	private isPolling = false

	constructor(options: AzureQueueAdapterOptions) {
		super(options)
		this.queueClient = options.queueClient
		this.cosmosClient = options.cosmosClient
		this.cosmosDatabaseName = options.cosmosDatabaseName
		this.contextContainerName = options.contextContainerName
		this.statusContainerName = options.statusContainerName
		console.log(`[AzureQueueAdapter] Initialized for queue: ${this.queueClient.name}`)
	}

	protected createContext(runId: string): CosmosDbContext {
		return new CosmosDbContext(runId, {
			client: this.cosmosClient,
			databaseName: this.cosmosDatabaseName,
			containerName: this.contextContainerName,
		})
	}

	protected async enqueueJob(job: JobPayload): Promise<void> {
		const message = Buffer.from(JSON.stringify(job)).toString('base64')
		await this.queueClient.sendMessage(message)
	}

	protected async publishFinalResult(
		runId: string,
		result: { status: string; payload?: WorkflowResult; reason?: string },
	): Promise<void> {
		const statusContext = new CosmosDbContext(runId, {
			client: this.cosmosClient,
			databaseName: this.cosmosDatabaseName,
			containerName: this.statusContainerName,
		})
		await statusContext.set('finalStatus', result)
		console.log(`[AzureQueueAdapter] Published final result for Run ID ${runId}.`)
	}

	protected processJobs(handler: (job: JobPayload) => Promise<void>): void {
		if (this.isPolling) {
			console.warn('[AzureQueueAdapter] Polling is already active.')
			return
		}
		this.isPolling = true
		console.log('[AzureQueueAdapter] Worker starting to poll for jobs...')
		this.poll(handler)
	}

	private async poll(handler: (job: JobPayload) => Promise<void>): Promise<void> {
		while (this.isPolling) {
			try {
				const response = await this.queueClient.receiveMessages({
					numberOfMessages: 10,
					visibilityTimeout: 30, // 30 seconds to process
				})

				if (response.receivedMessageItems.length > 0) {
					await Promise.all(
						response.receivedMessageItems.map(async (message) => {
							try {
								const job = JSON.parse(Buffer.from(message.messageText, 'base64').toString()) as JobPayload
								console.log(`[AzureQueueAdapter] ==> Picked up job for Node: ${job.nodeId}, Run: ${job.runId}`)
								await handler(job)
								await this.queueClient.deleteMessage(message.messageId, message.popReceipt)
							} catch (err) {
								console.error('[AzureQueueAdapter] Error processing message, it will become visible again:', err)
								// if we fail, we don't delete the message - it will reappear after the visibilityTimeout
							}
						}),
					)
				}
				// if no messages, the loop will wait for the next iteration
			} catch (error) {
				console.error('[AzureQueueAdapter] Error during queue polling:', error)
				await new Promise((resolve) => setTimeout(resolve, 5000))
			}
		}
	}

	public stop(): void {
		console.log('[AzureQueueAdapter] Stopping worker polling.')
		this.isPolling = false
	}
}

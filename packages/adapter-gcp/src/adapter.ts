import { Buffer } from 'node:buffer'
import type { Firestore } from '@google-cloud/firestore'
import type { PubSub, Subscription } from '@google-cloud/pubsub'
import type { AdapterOptions, JobPayload, WorkflowResult } from 'flowcraft'
import { BaseDistributedAdapter } from 'flowcraft'
import type { Redis as RedisClient } from 'ioredis'
import { FirestoreContext } from './context'

export interface PubSubAdapterOptions extends AdapterOptions {
	pubsubClient: PubSub
	firestoreClient: Firestore
	redisClient: RedisClient
	topicName: string
	subscriptionName: string
	contextCollectionName: string
	statusCollectionName: string
}

/**
 * A distributed adapter for Flowcraft that uses Google Cloud Pub/Sub,
 * Firestore for context, and Redis for coordination.
 */
export class PubSubAdapter extends BaseDistributedAdapter {
	private readonly pubsub: PubSub
	private readonly firestore: Firestore
	private readonly topicName: string
	private readonly subscriptionName: string
	private readonly contextCollectionName: string
	private readonly statusCollectionName: string
	private subscription?: Subscription

	constructor(options: PubSubAdapterOptions) {
		super(options)
		this.pubsub = options.pubsubClient
		this.firestore = options.firestoreClient
		this.topicName = options.topicName
		this.subscriptionName = options.subscriptionName
		this.contextCollectionName = options.contextCollectionName
		this.statusCollectionName = options.statusCollectionName
		console.log(`[PubSubAdapter] Initialized for topic: ${this.topicName}`)
	}

	protected createContext(runId: string): FirestoreContext {
		return new FirestoreContext(runId, {
			client: this.firestore,
			collectionName: this.contextCollectionName,
		})
	}

	protected async enqueueJob(job: JobPayload): Promise<void> {
		const dataBuffer = Buffer.from(JSON.stringify(job), 'utf-8')
		await this.pubsub.topic(this.topicName).publishMessage({ data: dataBuffer })
	}

	protected async publishFinalResult(
		runId: string,
		result: { status: string; payload?: WorkflowResult; reason?: string },
	): Promise<void> {
		const statusDocRef = this.firestore.collection(this.statusCollectionName).doc(runId)
		await statusDocRef.set({ finalStatus: result })
		console.log(`[PubSubAdapter] Published final result for Run ID ${runId}.`)
	}

	protected processJobs(handler: (job: JobPayload) => Promise<void>): void {
		if (this.subscription) {
			console.warn('[PubSubAdapter] Subscription listener is already active.')
			return
		}

		this.subscription = this.pubsub.subscription(this.subscriptionName)

		const messageHandler = async (message: any) => {
			try {
				const job = JSON.parse(message.data.toString('utf-8')) as JobPayload
				console.log(`[PubSubAdapter] ==> Picked up job for Node: ${job.nodeId}, Run: ${job.runId}`)
				await handler(job)
				message.ack() // acknowledge the message so it's not redelivered
			} catch (err) {
				console.error('[PubSubAdapter] Error processing message, nacking:', err)
				message.nack() // nack the message so Pub/Sub can redeliver it later
			}
		}

		this.subscription.on('message', messageHandler)
		this.subscription.on('error', (error) => {
			console.error('[PubSubAdapter] Received error from Pub/Sub subscription:', error)
		})

		console.log(`[PubSubAdapter] Worker listening for jobs on subscription: "${this.subscriptionName}"`)
	}

	public async stop(): Promise<void> {
		if (this.subscription) {
			console.log('[PubSubAdapter] Stopping worker listener.')
			await this.subscription.close()
			this.subscription = undefined
		}
	}
}

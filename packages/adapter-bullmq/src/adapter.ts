import type { ConnectionOptions, Job } from 'bullmq'
import { Queue, Worker } from 'bullmq'
import type { AdapterOptions, JobPayload } from 'flowcraft'
import { BaseDistributedAdapter } from 'flowcraft'
import Redis, { type RedisOptions } from 'ioredis'
import { RedisContext } from './context'

const STATUS_KEY_PREFIX = 'workflow:status:'

export interface BullMQAdapterOptions extends AdapterOptions {
	connection: RedisOptions | Redis
	queueName?: string
}

export class BullMQAdapter extends BaseDistributedAdapter {
	private readonly connection: RedisOptions | Redis
	private readonly redisClient: Redis
	private readonly queue: Queue
	private readonly queueName: string
	private worker?: Worker

	constructor(options: BullMQAdapterOptions) {
		super(options)
		this.connection = options.connection
		this.redisClient =
			options.connection instanceof Redis ? options.connection : new Redis(options.connection as RedisOptions)
		this.queueName = options.queueName || 'flowcraft-queue'
		this.queue = new Queue(this.queueName, { connection: this.redisClient as ConnectionOptions })
		this.logger.info(`[BullMQAdapter] Connected to queue '${this.queueName}'.`)
	}

	protected createContext(runId: string) {
		return new RedisContext(this.redisClient, runId)
	}

	protected processJobs(handler: (job: JobPayload) => Promise<void>): void {
		this.worker = new Worker(
			this.queueName,
			async (job: Job) => {
				this.logger.info(`[BullMQAdapter] ==> Picked up job ID: ${job.id}, Name: ${job.name}`)
				await handler(job.data as JobPayload)
			},
			{ connection: this.redisClient as ConnectionOptions, concurrency: 5 },
		)

		this.logger.info(`[BullMQAdapter] Worker listening for jobs on queue: "${this.queueName}".`)
	}

	protected async enqueueJob(job: JobPayload): Promise<void> {
		await this.queue.add('executeNode', job)
	}

	protected async publishFinalResult(runId: string, result: any): Promise<void> {
		const statusKey = `${STATUS_KEY_PREFIX}${runId}`
		await this.redisClient.set(statusKey, JSON.stringify(result), 'EX', 3600)
	}

	public async registerWebhookEndpoint(_runId: string, _nodeId: string): Promise<{ url: string; event: string }> {
		// TODO: Implement webhook endpoint registration for BullMQ adapter
		// This would typically involve setting up an HTTP endpoint that can trigger the workflow
		throw new Error('registerWebhookEndpoint not implemented for BullMQAdapter')
	}

	public async close(): Promise<void> {
		this.logger.info('[BullMQAdapter] Closing worker and queue...')
		await this.worker?.close()
		await this.queue.close()
		const wasCreatedInternally = !(this.connection instanceof Redis)
		if (wasCreatedInternally) {
			await this.redisClient.quit()
		}
	}
}

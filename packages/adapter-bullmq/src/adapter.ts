import { Queue, Worker } from 'bullmq'
import type { AdapterOptions, JobPayload } from 'flowcraft'
import { BaseDistributedAdapter } from 'flowcraft'
import type { Redis } from 'ioredis'
import { RedisContext } from './context'

const STATUS_KEY_PREFIX = 'workflow:status:'

export interface BullMQAdapterOptions extends AdapterOptions {
	connection: Redis
	queueName?: string
}

export class BullMQAdapter extends BaseDistributedAdapter {
	private readonly redis: Redis
	private readonly queue: Queue
	private readonly queueName: string
	private worker?: Worker

	constructor(options: BullMQAdapterOptions) {
		super(options)
		this.redis = options.connection
		this.queueName = options.queueName || 'flowcraft-queue'
		this.queue = new Queue(this.queueName, { connection: this.redis })
		console.log(`[BullMQAdapter] Connected to queue '${this.queueName}'.`)
	}

	protected createContext(runId: string) {
		return new RedisContext(this.redis, runId)
	}

	protected processJobs(handler: (job: JobPayload) => Promise<void>): void {
		this.worker = new Worker(
			this.queueName,
			async (job) => {
				console.log(`[BullMQAdapter] ==> Picked up job ID: ${job.id}, Name: ${job.name}`)
				await handler(job.data as JobPayload)
			},
			{ connection: this.redis, concurrency: 5 },
		)

		console.log(`[BullMQAdapter] Worker listening for jobs on queue: "${this.queueName}"`)
	}

	protected async enqueueJob(job: JobPayload): Promise<void> {
		await this.queue.add('executeNode', job)
	}

	protected async publishFinalResult(runId: string, result: any): Promise<void> {
		const statusKey = `${STATUS_KEY_PREFIX}${runId}`
		await this.redis.set(statusKey, JSON.stringify(result), 'EX', 3600)
	}

	public async close(): Promise<void> {
		console.log('[BullMQAdapter] Closing worker and queue...')
		await this.worker?.close()
		await this.queue.close()
	}
}

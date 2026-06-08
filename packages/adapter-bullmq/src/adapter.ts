import type { ConnectionOptions, DefaultJobOptions, Job } from 'bullmq'
import { Queue, Worker } from 'bullmq'
import type { AdapterOptions, JobPayload, NodeDefinition } from 'flowcraft'
import { BaseDistributedAdapter } from 'flowcraft'
import Redis, { type RedisOptions } from 'ioredis'
import { RedisContext } from './context'

const STATUS_KEY_PREFIX = 'workflow:status:'
const STATE_KEY_PREFIX = 'workflow:state:'

/** Default TTL for workflow state and status keys in Redis (24 hours). */
const DEFAULT_STATE_TTL_SECONDS = 86400

export interface BullMQAdapterOptions extends AdapterOptions {
	connection: RedisOptions | Redis
	queueName?: string
	/**
	 * Allows BullMQ native job options applied to every job in the queue.
	 *
	 * Use this to configure retention (`removeOnComplete`, `removeOnFail`)
	 * and other BullMQ-specific behaviors.
	 *
	 * @defaultValue {
	 *   removeOnComplete: 60 * 60 * 24 * 7, // 1 week
	 *   removeOnFail: 60 * 60 * 24 * 15, // 15 days
	 * }
	 */
	defaultJobOptions?: DefaultJobOptions
	/**
	 * How long (in seconds) workflow state and status keys are retained in Redis
	 * after a run completes or fails.
	 *
	 * Defaults to `86400` (24 hours). Set to `0` to disable TTL entirely
	 */
	stateTtlSeconds?: number
	/**
	 * Controls how node retries are handled.
	 *
	 * - `'in-process'` (default): Retries run in a tight loop inside the worker process
	 *   via `withRetries()`. This is the legacy behavior and is backward-compatible.
	 * - `'queue'`: Each retry is a separate BullMQ job. BullMQ's native `attempts`
	 *   and `backoff` options handle retry scheduling, providing observability,
	 *   crash resilience, and exponential backoff.
	 *
	 * @default 'in-process'
	 */
	retryMode?: 'in-process' | 'queue'
}

export class BullMQAdapter extends BaseDistributedAdapter {
	private readonly connection: RedisOptions | Redis
	private readonly redisClient: Redis
	private readonly queue: Queue
	private readonly queueName: string
	private readonly stateTtlSeconds: number
	private readonly retryMode: 'in-process' | 'queue'
	private worker?: Worker

	constructor(options: BullMQAdapterOptions) {
		super(options)
		this.connection = options.connection
		this.redisClient =
			options.connection instanceof Redis
				? options.connection
				: new Redis(options.connection as RedisOptions)
		this.queueName = options.queueName || 'flowcraft-queue'
		this.stateTtlSeconds =
			options.stateTtlSeconds !== undefined ? options.stateTtlSeconds : DEFAULT_STATE_TTL_SECONDS
		this.retryMode = options.retryMode || 'in-process'
		this.queue = new Queue(this.queueName, {
			connection: this.redisClient as ConnectionOptions,
			defaultJobOptions: {
				removeOnComplete: { age: 60 * 60 * 24 * 7 },
				removeOnFail: { age: 60 * 60 * 24 * 15 },
				...options.defaultJobOptions,
			},
		})
		this.logger.info(`[BullMQAdapter] Connected to queue '${this.queueName}'.`)
	}

	protected createContext(runId: string) {
		return new RedisContext(this.redisClient, runId)
	}

	protected shouldRetryInProcess(_nodeDef: NodeDefinition): boolean {
		return this.retryMode !== 'queue'
	}

	protected getQueueRetryOptions(nodeDef: NodeDefinition): Record<string, any> | undefined {
		if (this.retryMode !== 'queue') return undefined
		const maxRetries = nodeDef.config?.maxRetries ?? 1
		const retryDelay = nodeDef.config?.retryDelay ?? 1000
		return {
			attempts: maxRetries,
			backoff: { type: 'exponential', delay: retryDelay },
		}
	}

	protected processJobs(handler: (job: JobPayload) => Promise<void>): void {
		this.worker = new Worker(
			this.queueName,
			async (job: Job) => {
				this.logger.info(`[BullMQAdapter] ==> Picked up job ID: ${job.id}, Name: ${job.name}`)

				const optsAttempts = job.opts.attempts || 1
				const attemptsMade = job.attemptsMade || 0
				const isLastAttempt = this.retryMode === 'queue' ? attemptsMade >= optsAttempts - 1 : true
				const attempt = attemptsMade + 1

				const payload: JobPayload = {
					...job.data,
					isLastAttempt,
					attempt,
				}

				await handler(payload)
			},
			{ connection: this.redisClient as ConnectionOptions, concurrency: 5 },
		)

		this.logger.info(`[BullMQAdapter] Worker listening for jobs on queue: "${this.queueName}".`)
	}

	protected async enqueueJob(job: JobPayload): Promise<void> {
		const blueprint = this.runtime.options.blueprints?.[job.blueprintId]
		const nodeDef = blueprint?.nodes.find((n) => n.id === job.nodeId)
		const retryOptions = nodeDef ? this.getQueueRetryOptions(nodeDef) : undefined
		await this.queue.add('executeNode', job, {
			jobId: `${job.runId}_${job.nodeId}`,
			...retryOptions,
		})
	}

	protected async publishFinalResult(runId: string, result: any): Promise<void> {
		const statusKey = `${STATUS_KEY_PREFIX}${runId}`
		const stateKey = `${STATE_KEY_PREFIX}${runId}`

		if (this.stateTtlSeconds > 0) {
			await this.redisClient.set(statusKey, JSON.stringify(result), 'EX', this.stateTtlSeconds)
			await this.redisClient.expire(stateKey, this.stateTtlSeconds)
		} else {
			// stateTtlSeconds === 0: persist indefinitely
			await this.redisClient.set(statusKey, JSON.stringify(result))
		}
	}

	public async registerWebhookEndpoint(
		_runId: string,
		_nodeId: string,
	): Promise<{ url: string; event: string }> {
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

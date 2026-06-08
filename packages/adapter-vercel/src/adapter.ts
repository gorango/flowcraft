import type { AdapterOptions, JobPayload, WorkflowResult } from 'flowcraft'
import { BaseDistributedAdapter } from 'flowcraft'
import type { Redis } from 'ioredis'
import { send } from '@vercel/queue'
import { VercelKvContext } from './context'

export interface VercelQueueAdapterOptions extends AdapterOptions {
	redisClient: Redis
	topicName: string
	contextKeyPrefix?: string
	statusKeyPrefix?: string
	contextTtlSeconds?: number
	statusTtlSeconds?: number
}

function getStatusKey(runId: string, prefix = 'flowcraft:status:'): string {
	return `${prefix}${runId}`
}

/**
 * A distributed adapter for Flowcraft that uses Vercel Queues for job queuing
 * and Redis (e.g., Upstash) for state and coordination.
 *
 * Designed for serverless execution via Vercel Functions with queue triggers.
 */
export class VercelQueueAdapter extends BaseDistributedAdapter {
	private readonly redis: Redis
	private readonly topicName: string
	private readonly contextKeyPrefix: string
	private readonly statusKeyPrefix: string
	private readonly contextTtlSeconds: number
	private readonly statusTtlSeconds: number

	constructor(options: VercelQueueAdapterOptions) {
		super(options)
		this.redis = options.redisClient
		this.topicName = options.topicName
		this.contextKeyPrefix = options.contextKeyPrefix ?? 'flowcraft:context:'
		this.statusKeyPrefix = options.statusKeyPrefix ?? 'flowcraft:status:'
		this.contextTtlSeconds = options.contextTtlSeconds ?? 86400
		this.statusTtlSeconds = options.statusTtlSeconds ?? 86400
		this.logger.info(`[VercelQueueAdapter] Initialized for topic: ${this.topicName}`)
	}

	protected createContext(runId: string): VercelKvContext {
		return new VercelKvContext(runId, {
			client: this.redis,
			keyPrefix: this.contextKeyPrefix,
			ttlSeconds: this.contextTtlSeconds,
		})
	}

	protected async onJobStart(_runId: string, _blueprintId: string, _nodeId: string): Promise<void> {
		try {
			const statusKey = getStatusKey(_runId, this.statusKeyPrefix)
			const current = await this.redis.get(statusKey)
			const status = current ? JSON.parse(current) : {}
			status.status = 'running'
			status.lastUpdated = Math.floor(Date.now() / 1000)
			await this.redis.set(statusKey, JSON.stringify(status), 'EX', this.statusTtlSeconds)
		} catch (error) {
			this.logger.error(
				`[VercelQueueAdapter] Failed to update lastUpdated timestamp for Run ID ${_runId}`,
				{ error },
			)
		}
	}

	protected async enqueueJob(job: JobPayload): Promise<void> {
		await send(this.topicName, job)
	}

	protected async publishFinalResult(
		runId: string,
		result: { status: string; payload?: WorkflowResult; reason?: string },
	): Promise<void> {
		const statusKey = getStatusKey(runId, this.statusKeyPrefix)
		const status = {
			finalStatus: result,
			status: result.status,
			lastUpdated: Math.floor(Date.now() / 1000),
		}
		await this.redis.set(statusKey, JSON.stringify(status), 'EX', this.statusTtlSeconds)
		this.logger.info(`[VercelQueueAdapter] Published final result for Run ID ${runId}.`)
	}

	public async registerWebhookEndpoint(
		_runId: string,
		_nodeId: string,
	): Promise<{ url: string; event: string }> {
		throw new Error('registerWebhookEndpoint not implemented for VercelQueueAdapter')
	}

	/**
	 * Process a single job. This is called by the Vercel queue consumer handler.
	 * Use this in your route handler:
	 *
	 * ```typescript
	 * import { handleCallback } from '@vercel/queue'
	 * export const POST = handleCallback(async (message) => {
	 *   await adapter.handleJob(message)
	 * })
	 * ```
	 */
	public async handleJob(job: JobPayload): Promise<void> {
		await super.handleJob(job)
	}

	/**
	 * Polling is not supported. Vercel Queues work via push (queue triggers), not pull.
	 * Use handleJob() in your queue consumer handler instead.
	 */
	protected processJobs(_handler: (job: JobPayload) => Promise<void>): void {
		this.logger.error(
			'[VercelQueueAdapter] processJobs() is not supported in serverless mode. ' +
				'Use handleJob() in your queue consumer handler instead.',
		)
		throw new Error(
			'processJobs() is not supported in serverless mode. ' +
				'Use handleJob() in your queue consumer handler instead.',
		)
	}

	/**
	 * Polling is not supported. Use handleJob() in queue consumer handler.
	 */
	public start(): void {
		this.logger.error(
			'[VercelQueueAdapter] start() is not supported in serverless mode. ' +
				'Use handleJob() in your queue consumer handler instead.',
		)
		throw new Error(
			'start() is not supported in serverless mode. ' +
				'Use handleJob() in your queue consumer handler instead.',
		)
	}

	/**
	 * Polling is not supported. Use handleJob() in queue consumer handler.
	 */
	public stop(): void {
		this.logger.warn('[VercelQueueAdapter] stop() is a no-op in serverless mode.')
	}
}

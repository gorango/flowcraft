import type { AdapterOptions, JobPayload, WorkflowResult } from 'flowcraft'
import { BaseDistributedAdapter } from 'flowcraft'
import { DurableObjectContext, type DurableObjectStorage } from './context'
import type { KVNamespace } from './store'

export interface CloudflareQueueAdapterOptions extends AdapterOptions {
	queue: CloudflareQueue
	durableObjectStorage: DurableObjectStorage
	queueName: string
	statusKVNamespace: KVNamespace
	statusPrefix?: string
}

export interface CloudflareQueue {
	send(message: unknown): Promise<void>
}

function getStatusKey(runId: string, prefix = 'flowcraft:status:'): string {
	return `${prefix}${runId}`
}

export class CloudflareQueueAdapter extends BaseDistributedAdapter {
	private readonly queue: CloudflareQueue
	private readonly durableObjectStorage: DurableObjectStorage
	private readonly queueName: string
	private readonly statusKVNamespace: KVNamespace
	private readonly statusPrefix: string

	constructor(options: CloudflareQueueAdapterOptions) {
		super(options)
		this.queue = options.queue
		this.durableObjectStorage = options.durableObjectStorage
		this.queueName = options.queueName
		this.statusKVNamespace = options.statusKVNamespace
		this.statusPrefix = options.statusPrefix ?? 'flowcraft:status:'
		this.logger.info(`[CloudflareQueueAdapter] Initialized for queue: ${this.queueName}`)
	}

	protected createContext(runId: string): DurableObjectContext {
		return new DurableObjectContext(runId, {
			storage: this.durableObjectStorage,
			runId,
		})
	}

	protected async enqueueJob(job: JobPayload): Promise<void> {
		await this.queue.send(job)
	}

	protected async onJobStart(_runId: string, _blueprintId: string, _nodeId: string): Promise<void> {
		try {
			const statusKey = getStatusKey(_runId, this.statusPrefix)
			const current = await this.statusKVNamespace.get(statusKey, 'text')
			const status = current ? JSON.parse(current) : {}
			status.status = 'running'
			status.lastUpdated = Math.floor(Date.now() / 1000)
			await this.statusKVNamespace.put(statusKey, JSON.stringify(status), {
				expirationTtl: 86400,
			})
		} catch (error) {
			this.logger.error(
				`[CloudflareQueueAdapter] Failed to update lastUpdated timestamp for Run ID ${_runId}`,
				{
					error,
				},
			)
		}
	}

	protected async publishFinalResult(
		runId: string,
		result: { status: string; payload?: WorkflowResult; reason?: string },
	): Promise<void> {
		const statusKey = getStatusKey(runId, this.statusPrefix)
		const status = {
			finalStatus: result,
			status: result.status,
			lastUpdated: Math.floor(Date.now() / 1000),
		}
		await this.statusKVNamespace.put(statusKey, JSON.stringify(status), {
			expirationTtl: 86400,
		})
		this.logger.info(`[CloudflareQueueAdapter] Published final result for Run ID ${runId}.`)
	}

	public async registerWebhookEndpoint(
		_runId: string,
		_nodeId: string,
	): Promise<{ url: string; event: string }> {
		throw new Error('registerWebhookEndpoint not implemented for CloudflareAdapter')
	}

	/**
	 * Public API for processing a single job message from Cloudflare Queues.
	 * Use this in your Worker's queue handler:
	 *
	 * ```typescript
	 * export default {
	 *   async queue(batch: MessageBatch, env: Env): Promise<void> {
	 *     for (const message of batch.messages) {
	 *       try {
	 *         const job = message.body as JobPayload
	 *         await adapter.handleJob(job)
	 *         message.ack()
	 *       } catch (error) {
	 *         console.error('Failed to process job:', error)
	 *         message.nack()
	 *       }
	 *     }
	 *   },
	 * }
	 * ```
	 */
	public async handleJob(job: JobPayload): Promise<void> {
		await super.handleJob(job)
	}

	/**
	 * Polling is not supported in Cloudflare Workers environment.
	 * Cloudflare Queues work via push (Workers queue handler), not pull.
	 * Use handleJob() in your queue handler instead.
	 */
	protected processJobs(_handler: (job: JobPayload) => Promise<void>): void {
		this.logger.error(
			'[CloudflareQueueAdapter] processJobs() is not supported in Cloudflare Workers. ' +
				'Use handleJob() in your queue handler instead.',
		)
		throw new Error(
			'processJobs() is not supported in Cloudflare Workers. ' +
				'Use handleJob() in your queue handler instead.',
		)
	}

	/**
	 * Polling is not supported. Use handleJob() in queue handler.
	 */
	public start(): void {
		this.logger.error(
			'[CloudflareQueueAdapter] start() is not supported in Cloudflare Workers. ' +
				'Use handleJob() in your queue handler instead.',
		)
		throw new Error(
			'start() is not supported in Cloudflare Workers. ' +
				'Use handleJob() in your queue handler instead.',
		)
	}

	/**
	 * Polling is not supported. Use handleJob() in queue handler.
	 */
	public stop(): void {
		this.logger.warn('[CloudflareQueueAdapter] stop() is a no-op in Cloudflare Workers.')
	}
}

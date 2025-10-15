import { Buffer } from 'node:buffer'
import type * as amqplib from 'amqplib'
import type { Channel, ConsumeMessage } from 'amqplib'
import type { AdapterOptions, JobPayload, WorkflowResult } from 'flowcraft'
import { BaseDistributedAdapter } from 'flowcraft'
import type { Client as PgClient } from 'pg'
import { PostgresContext } from './context'

type AmqpConnection = Awaited<ReturnType<typeof amqplib.connect>>

export interface RabbitMqAdapterOptions extends AdapterOptions {
	amqpConnection: AmqpConnection
	pgClient: PgClient
	queueName?: string
	contextTableName: string
	statusTableName: string
}

export class RabbitMqAdapter extends BaseDistributedAdapter {
	private readonly pg: PgClient
	private readonly contextTableName: string
	private readonly statusTableName: string
	private readonly queueName: string
	private channel?: Channel

	constructor(private options: RabbitMqAdapterOptions) {
		super(options)
		this.pg = options.pgClient
		this.contextTableName = options.contextTableName
		this.statusTableName = options.statusTableName
		this.queueName = options.queueName || 'flowcraft-queue'
	}

	protected createContext(runId: string): PostgresContext {
		return new PostgresContext(runId, {
			client: this.pg,
			tableName: this.contextTableName,
		})
	}

	protected async enqueueJob(job: JobPayload): Promise<void> {
		if (!this.channel) {
			throw new Error('RabbitMQ channel is not available. Ensure the worker has been started.')
		}
		const jobBuffer = Buffer.from(JSON.stringify(job), 'utf-8')
		this.channel.sendToQueue(this.queueName, jobBuffer, { persistent: true })
	}

	protected async publishFinalResult(
		runId: string,
		result: { status: string; payload?: WorkflowResult; reason?: string },
	): Promise<void> {
		const query = `
      INSERT INTO ${this.statusTableName} (run_id, status_data, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (run_id) DO UPDATE SET status_data = $2, updated_at = NOW();
    `
		await this.pg.query(query, [runId, result])
		console.log(`[RabbitMqAdapter] Published final result for Run ID ${runId}.`)
	}

	protected async processJobs(handler: (job: JobPayload) => Promise<void>): Promise<void> {
		if (this.channel) {
			console.warn('[RabbitMqAdapter] Channel and consumer are already set up.')
			return
		}

		try {
			this.channel = await this.options.amqpConnection.createChannel()
			await this.channel.assertQueue(this.queueName, { durable: true })
			await this.channel.prefetch(1)

			console.log(`[RabbitMqAdapter] Worker listening for jobs on queue: "${this.queueName}"`)

			await this.channel.consume(this.queueName, async (msg: ConsumeMessage | null) => {
				if (msg !== null && this.channel) {
					// add null check for channel
					try {
						const job = JSON.parse(msg.content.toString('utf-8')) as JobPayload
						console.log(`[RabbitMqAdapter] ==> Picked up job for Node: ${job.nodeId}, Run: ${job.runId}`)
						await handler(job)
						this.channel.ack(msg)
					} catch (err) {
						console.error('[RabbitMqAdapter] Error processing message, nacking:', err)
						this.channel.nack(msg, false, false)
					}
				}
			})
		} catch (error) {
			console.error('[RabbitMqAdapter] Failed to set up RabbitMQ consumer:', error)
		}
	}

	public async stop(): Promise<void> {
		if (this.channel) {
			console.log('[RabbitMqAdapter] Closing RabbitMQ channel.')
			await this.channel.close()
			this.channel = undefined
		}
	}
}

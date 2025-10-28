import type { Client as CassandraClient } from 'cassandra-driver'
import type { AdapterOptions, JobPayload, WorkflowResult } from 'flowcraft'
import { BaseDistributedAdapter } from 'flowcraft'
import type { Consumer, Kafka, Producer } from 'kafkajs'
import { CassandraContext } from './context'

export interface KafkaAdapterOptions extends AdapterOptions {
	kafka: Kafka
	cassandraClient: CassandraClient
	topicName?: string
	groupId?: string
	keyspace: string
	contextTableName: string
	statusTableName: string
}

/**
 * A distributed adapter for Flowcraft that uses Apache Kafka for job queuing
 * and Apache Cassandra for context storage.
 */
export class KafkaAdapter extends BaseDistributedAdapter {
	private readonly cassandra: CassandraClient
	private readonly keyspace: string
	private readonly contextTableName: string
	private readonly statusTableName: string
	private readonly topicName: string
	private readonly groupId: string
	private producer: Producer
	private consumer: Consumer
	private isRunning = false

	constructor(options: KafkaAdapterOptions) {
		super(options)
		this.cassandra = options.cassandraClient
		this.keyspace = options.keyspace
		this.contextTableName = options.contextTableName
		this.statusTableName = options.statusTableName
		this.topicName = options.topicName || 'flowcraft-jobs'
		this.groupId = options.groupId || 'flowcraft-workers'

		this.producer = options.kafka.producer()
		this.consumer = options.kafka.consumer({ groupId: this.groupId })
	}

	protected createContext(runId: string): CassandraContext {
		return new CassandraContext(runId, {
			client: this.cassandra,
			keyspace: this.keyspace,
			tableName: this.contextTableName,
		})
	}

	protected async onJobStart(_runId: string, _blueprintId: string, _nodeId: string): Promise<void> {
		// Touch the status table to update the 'updated_at' timestamp.
		try {
			// Using an INSERT as an UPSERT. This only sets status if it's the first touch.
			const touchQuery = `INSERT INTO ${this.keyspace}.${this.statusTableName} (run_id, status, updated_at) VALUES (?, 'running', toTimestamp(now())) IF NOT EXISTS`
			const updateQuery = `UPDATE ${this.keyspace}.${this.statusTableName} SET updated_at = toTimestamp(now()) WHERE run_id = ?`

			const result = await this.cassandra.execute(touchQuery, [_runId], { prepare: true })
			// If the row already existed, the insert was not applied, so we update instead.
			if (!result.wasApplied()) {
				await this.cassandra.execute(updateQuery, [_runId], { prepare: true })
			}
		} catch (error) {
			console.error(`[KafkaAdapter] Failed to update updated_at timestamp for Run ID ${_runId}`, error)
		}
	}

	protected async publishFinalResult(
		runId: string,
		result: { status: string; payload?: WorkflowResult; reason?: string },
	): Promise<void> {
		const query = `INSERT INTO ${this.keyspace}.${this.statusTableName} (run_id, status, status_data, updated_at) VALUES (?, ?, ?, toTimestamp(now()))`
		await this.cassandra.execute(query, [runId, result.status, JSON.stringify(result)], {
			prepare: true,
		})
		this.logger.info(`[KafkaAdapter] Published final result for Run ID ${runId}.`)
	}

	public async registerWebhookEndpoint(_runId: string, _nodeId: string): Promise<{ url: string; event: string }> {
		// TODO: Implement webhook endpoint registration for Kafka adapter
		// This would typically involve setting up a REST endpoint that publishes to Kafka
		throw new Error('registerWebhookEndpoint not implemented for KafkaAdapter')
	}

	protected async enqueueJob(job: JobPayload): Promise<void> {
		if (!this.isRunning) {
			throw new Error('Kafka producer is not connected. Adapter must be started.')
		}
		await this.producer.send({
			topic: this.topicName,
			messages: [
				{
					key: job.runId, // use runId as key to ensure ordering within a partition
					value: JSON.stringify(job),
				},
			],
		})
	}

	protected async processJobs(handler: (job: JobPayload) => Promise<void>): Promise<void> {
		if (this.isRunning) {
			this.logger.warn('[KafkaAdapter] Consumer is already running.')
			return
		}

		try {
			await this.producer.connect()
			await this.consumer.connect()
			await this.consumer.subscribe({
				topic: this.topicName,
				fromBeginning: false,
			})
			this.isRunning = true

			this.logger.info(`[KafkaAdapter] Worker (Group: ${this.groupId}) listening on topic: "${this.topicName}"`)

			await this.consumer.run({
				partitionsConsumedConcurrently: 1,
				eachMessage: async ({ topic, partition, message }) => {
					if (message.value) {
						try {
							const job = JSON.parse(message.value.toString()) as JobPayload
							this.logger.info(
								`[KafkaAdapter] ==> [P${partition}] Picked up job for Node: ${job.nodeId}, Run: ${job.runId}`,
							)
							await handler(job)
							// kafka handles offsets automatically on success
						} catch (error) {
							this.logger.error(`[KafkaAdapter] Error processing message on topic ${topic}:`, { error })
							// throwing - kafka will not commit the offset and the message will be re-consumed based on policy
							throw error
						}
					}
				},
			})
		} catch (error) {
			this.logger.error('[KafkaAdapter] Failed to start Kafka producer/consumer:', { error })
			this.isRunning = false
		}
	}

	public async stop(): Promise<void> {
		this.logger.info('[KafkaAdapter] Stopping Kafka producer and consumer.')
		await this.consumer.disconnect()
		await this.producer.disconnect()
		this.isRunning = false
	}
}

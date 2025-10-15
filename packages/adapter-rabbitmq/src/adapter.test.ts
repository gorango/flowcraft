import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StartedRabbitMQContainer } from '@testcontainers/rabbitmq'
import { RabbitMQContainer } from '@testcontainers/rabbitmq'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { RedisContainer } from '@testcontainers/redis'
import * as amqplib from 'amqplib'
import type { JobPayload } from 'flowcraft'
import Redis from 'ioredis'
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RabbitMqAdapter } from './adapter'
import { RedisCoordinationStore } from './store'

const QUEUE_NAME = 'flowcraft-test-queue'
const CONTEXT_TABLE = 'contexts'
const STATUS_TABLE = 'statuses'

describe('RabbitMqAdapter - Testcontainers Integration', () => {
	let rabbitContainer: StartedRabbitMQContainer
	let pgContainer: StartedPostgreSqlContainer
	let redisContainer: StartedRedisContainer

	let amqpConnection: amqplib.Connection
	let pgClient: PgClient
	let redis: Redis

	beforeAll(async () => {
		;[rabbitContainer, pgContainer, redisContainer] = await Promise.all([
			new RabbitMQContainer('rabbitmq:management-alpine').start(),
			new PostgreSqlContainer('postgres:latest').start(),
			new RedisContainer('redis:latest').start(),
		])

		amqpConnection = (await amqplib.connect(rabbitContainer.getAmqpUrl())) as unknown as amqplib.Connection
		pgClient = new PgClient({
			connectionString: pgContainer.getConnectionUri(),
		})
		await pgClient.connect()
		redis = new Redis(redisContainer.getConnectionUrl())

		await pgClient.query(`CREATE TABLE ${CONTEXT_TABLE} (run_id TEXT PRIMARY KEY, context_data JSONB);`)
		await pgClient.query(
			`CREATE TABLE ${STATUS_TABLE} (run_id TEXT PRIMARY KEY, status_data JSONB, updated_at TIMESTAMPTZ);`,
		)
	}, 60000)

	afterAll(async () => {
		// @ts-expect-error bad amqp types
		await amqpConnection.close()
		await pgClient.end()
		await Promise.all([rabbitContainer.stop(), pgContainer.stop(), redisContainer.stop()])
	})

	it('should successfully enqueue a job into the RabbitMQ queue', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new RabbitMqAdapter({
			// @ts-expect-error bad amqp types
			amqpConnection,
			pgClient,
			queueName: QUEUE_NAME,
			contextTableName: CONTEXT_TABLE,
			statusTableName: STATUS_TABLE,
			coordinationStore,
			runtimeOptions: {},
		})

		// @ts-expect-error bad amqp types
		const channel = await amqpConnection.createChannel()
		await channel.assertQueue(QUEUE_NAME, { durable: true })
		;(adapter as any).channel = channel

		const job: JobPayload = {
			runId: 'run-rabbit-1',
			blueprintId: 'bp-rabbit',
			nodeId: 'node-rabbit',
		}

		await (adapter as any).enqueueJob(job)

		const message = await channel.get(QUEUE_NAME, { noAck: true })
		expect(message).not.toBe(false)

		const msg = message as amqplib.Message
		const receivedJob = JSON.parse(msg.content.toString())
		expect(receivedJob).toEqual(job)

		await channel.close()
	})
})

import type { StartedCassandraContainer } from '@testcontainers/cassandra'
import { CassandraContainer } from '@testcontainers/cassandra'
import type { StartedKafkaContainer } from '@testcontainers/kafka'
import { KafkaContainer } from '@testcontainers/kafka'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { RedisContainer } from '@testcontainers/redis'
import { Client as CassandraClient } from 'cassandra-driver'
import type { JobPayload } from 'flowcraft'
import Redis from 'ioredis'
import { Kafka } from 'kafkajs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { KafkaAdapter } from './adapter'
import { RedisCoordinationStore } from './store'

const TOPIC_NAME = 'flowcraft-test-topic'
const KEYSPACE = 'testkeyspace'
const CONTEXT_TABLE = 'contexts'
const STATUS_TABLE = 'statuses'
const GROUP_ID = 'test-group'

describe('KafkaAdapter - Testcontainers Integration', () => {
	let kafkaContainer: StartedKafkaContainer
	let cassandraContainer: StartedCassandraContainer
	let redisContainer: StartedRedisContainer

	let kafka: Kafka
	let cassandraClient: CassandraClient
	let redis: Redis

	beforeAll(async () => {
		;[kafkaContainer, cassandraContainer, redisContainer] = await Promise.all([
			new KafkaContainer('confluentinc/cp-kafka:7.4.0').withExposedPorts(9093).withKraft().start(),
			new CassandraContainer('cassandra:latest').start(),
			new RedisContainer('redis:latest').start(),
		])

		kafka = new Kafka({
			clientId: 'test-client',
			brokers: [`localhost:${kafkaContainer.getMappedPort(9093)}`],
		})
		cassandraClient = new CassandraClient({
			contactPoints: [cassandraContainer.getContactPoint()],
			localDataCenter: cassandraContainer.getDatacenter(),
		})
		await cassandraClient.connect()
		redis = new Redis(redisContainer.getConnectionUrl())

		await cassandraClient.execute(
			`CREATE KEYSPACE IF NOT EXISTS ${KEYSPACE} WITH REPLICATION = {'class': 'SimpleStrategy', 'replication_factor': 1}`,
		)
		await cassandraClient.execute(`USE ${KEYSPACE}`)
		await cassandraClient.execute(
			`CREATE TABLE IF NOT EXISTS ${CONTEXT_TABLE} (run_id TEXT PRIMARY KEY, context_data TEXT)`,
		)
		await cassandraClient.execute(
			`CREATE TABLE IF NOT EXISTS ${STATUS_TABLE} (run_id TEXT PRIMARY KEY, status_data TEXT, updated_at TIMESTAMP)`,
		)

		const admin = kafka.admin()
		await admin.connect()
		await admin.createTopics({
			topics: [{ topic: TOPIC_NAME }],
			waitForLeaders: true,
		})
		await admin.disconnect()
	}, 90000)

	afterAll(async () => {
		await Promise.all([kafkaContainer.stop(), cassandraContainer.stop(), redisContainer.stop()])
		await cassandraClient.shutdown()
	})

	it('should successfully enqueue a job into the Kafka topic', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new KafkaAdapter({
			kafka,
			cassandraClient,
			topicName: TOPIC_NAME,
			groupId: GROUP_ID,
			keyspace: KEYSPACE,
			contextTableName: CONTEXT_TABLE,
			statusTableName: STATUS_TABLE,
			coordinationStore,
			runtimeOptions: {},
		})

		await (adapter as any).producer.connect()
		;(adapter as any).isRunning = true

		const job: JobPayload = {
			runId: 'run-kafka-1',
			blueprintId: 'bp-kafka',
			nodeId: 'node-kafka',
		}

		await (adapter as any).enqueueJob(job)

		const consumer = kafka.consumer({ groupId: `${GROUP_ID}-test` })
		await consumer.connect()
		await consumer.subscribe({ topic: TOPIC_NAME, fromBeginning: true })

		const receivedMessage = await new Promise<JobPayload | null>((resolve) => {
			consumer.run({
				eachMessage: async ({ message }) => {
					if (message.value) {
						resolve(JSON.parse(message.value.toString()))
					}
				},
			})
		})

		expect(receivedMessage).toEqual(job)

		await consumer.disconnect()
		await (adapter as any).producer.disconnect()
	})
})

import type { StartedFirestoreEmulatorContainer, StartedPubSubEmulatorContainer } from '@testcontainers/gcloud'
import type { StartedRedisContainer } from '@testcontainers/redis'
import type { JobPayload } from 'flowcraft'
import { Firestore } from '@google-cloud/firestore'
import { PubSub } from '@google-cloud/pubsub'
import { FirestoreEmulatorContainer, PubSubEmulatorContainer } from '@testcontainers/gcloud'
import { RedisContainer } from '@testcontainers/redis'
import Redis from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PubSubAdapter } from './adapter'
import { RedisCoordinationStore } from './store'

const PROJECT_ID = 'test-project'
const TOPIC_NAME = 'flowcraft-jobs-topic'
const SUBSCRIPTION_NAME = 'flowcraft-worker-sub'
const CONTEXT_COLLECTION = 'test-contexts'
const STATUS_COLLECTION = 'test-statuses'

describe('PubSubAdapter - Testcontainers Integration', () => {
	let pubsubContainer: StartedPubSubEmulatorContainer
	let firestoreContainer: StartedFirestoreEmulatorContainer
	let redisContainer: StartedRedisContainer

	let pubsub: PubSub
	let firestore: Firestore
	let redis: Redis

	beforeAll(async () => {
		[pubsubContainer, firestoreContainer, redisContainer] = await Promise.all([
			new PubSubEmulatorContainer('gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators').start(),
			new FirestoreEmulatorContainer('gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators').start(),
			new RedisContainer('redis:latest').start(),
		])

		pubsub = new PubSub({
			projectId: PROJECT_ID,
			apiEndpoint: `http://${pubsubContainer.getEmulatorEndpoint()}`,
		})

		firestore = new Firestore({
			projectId: PROJECT_ID,
			apiEndpoint: `http://${firestoreContainer.getEmulatorEndpoint()}`,
		})

		redis = new Redis(redisContainer.getConnectionUrl())
		const topic = pubsub.topic(TOPIC_NAME)
		await topic.create()
		await topic.createSubscription(SUBSCRIPTION_NAME)
	}, 90000)

	afterAll(async () => {
		await Promise.all([
			pubsubContainer?.stop(),
			firestoreContainer?.stop(),
			redisContainer?.stop(),
		])
	})

	it('should successfully enqueue a job into the Pub/Sub emulator', async () => {
		const coordinationStore = new RedisCoordinationStore(redis)
		const adapter = new PubSubAdapter({
			pubsubClient: pubsub,
			firestoreClient: firestore,
			redisClient: redis,
			topicName: TOPIC_NAME,
			subscriptionName: SUBSCRIPTION_NAME,
			contextCollectionName: CONTEXT_COLLECTION,
			statusCollectionName: STATUS_COLLECTION,
			coordinationStore,
			runtimeOptions: {},
		})

		const job: JobPayload = {
			runId: 'run-gcp-123',
			blueprintId: 'bp-gcp',
			nodeId: 'node-gcp-start',
		}

		const testSubName = `${SUBSCRIPTION_NAME}-test-pull`
		const [testSub] = await pubsub.topic(TOPIC_NAME).createSubscription(testSubName)

		// 1. Set up the listener promise
		const messagePromise = new Promise((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Timeout waiting for message')), 15000)
			testSub.once('message', (message) => {
				clearTimeout(timeout)
				message.ack()
				resolve(JSON.parse(message.data.toString()))
			})
		})

		// 2. Publish the job
		await (adapter as any).enqueueJob(job)

		// 3. Await the message
		const receivedMessage = await messagePromise

		await testSub.delete()
		expect(receivedMessage).toEqual(job)
	}, 20000)
})

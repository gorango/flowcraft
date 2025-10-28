import { Firestore } from '@google-cloud/firestore'
import { PubSub } from '@google-cloud/pubsub'
import type { StartedFirestoreEmulatorContainer, StartedPubSubEmulatorContainer } from '@testcontainers/gcloud'
import { FirestoreEmulatorContainer, PubSubEmulatorContainer } from '@testcontainers/gcloud'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { RedisContainer } from '@testcontainers/redis'
import type { JobPayload, PatchOperation } from 'flowcraft'
import Redis from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PubSubAdapter } from './adapter'
import { FirestoreContext } from './context'
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
		;[pubsubContainer, firestoreContainer, redisContainer] = await Promise.all([
			new PubSubEmulatorContainer('gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators').start(),
			new FirestoreEmulatorContainer('gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators').start(),
			new RedisContainer('redis:latest').start(),
		])

		pubsub = new PubSub({
			projectId: PROJECT_ID,
			apiEndpoint: `http://${pubsubContainer.getEmulatorEndpoint()}`,
		})

		// Set environment variable for Firestore emulator
		process.env.FIRESTORE_EMULATOR_HOST = firestoreContainer.getEmulatorEndpoint()

		firestore = new Firestore({
			projectId: PROJECT_ID,
		})

		redis = new Redis(redisContainer.getConnectionUrl())
		const topic = pubsub.topic(TOPIC_NAME)
		await topic.create()
		await topic.createSubscription(SUBSCRIPTION_NAME)
	}, 90000)

	afterAll(async () => {
		await Promise.all([pubsubContainer?.stop(), firestoreContainer?.stop(), redisContainer?.stop()])
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

		const messagePromise = new Promise((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Timeout waiting for message')), 15000)
			testSub.once('message', (message) => {
				clearTimeout(timeout)
				message.ack()
				resolve(JSON.parse(message.data.toString()))
			})
		})

		await (adapter as any).enqueueJob(job)
		const receivedMessage = await messagePromise
		await testSub.delete()
		expect(receivedMessage).toEqual(job)
	}, 20000)

	it('should support delta-based persistence with patch operations', async () => {
		const runId = 'test-delta-run'
		const context = new FirestoreContext(runId, {
			client: firestore,
			collectionName: CONTEXT_COLLECTION,
		})

		// Set initial data
		await context.set('user', { id: 1, name: 'Alice' })
		await context.set('count', 5)
		await context.set('items', ['a', 'b', 'c'])

		// Verify initial state
		expect(await context.get('user')).toEqual({ id: 1, name: 'Alice' })
		expect(await context.get('count')).toBe(5)
		expect(await context.get('items')).toEqual(['a', 'b', 'c'])

		// Apply patch operations
		const operations: PatchOperation[] = [
			{ op: 'set', key: 'user', value: { id: 1, name: 'Alice Updated' } },
			{ op: 'set', key: 'count', value: 10 },
			{ op: 'delete', key: 'items' },
			{ op: 'set', key: 'status', value: 'completed' },
		]

		await context.patch(operations)

		// Verify patched state
		expect(await context.get('user')).toEqual({ id: 1, name: 'Alice Updated' })
		expect(await context.get('count')).toBe(10)
		expect(await context.get('items')).toBeUndefined()
		expect(await context.get('status')).toBe('completed')

		// Verify full state
		const fullState = await context.toJSON()
		expect(fullState).toEqual({
			user: { id: 1, name: 'Alice Updated' },
			count: 10,
			status: 'completed',
		})
	})
})

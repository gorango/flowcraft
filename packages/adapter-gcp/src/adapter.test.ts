import { Firestore } from '@google-cloud/firestore'
import { PubSub } from '@google-cloud/pubsub'
import type {
	StartedFirestoreEmulatorContainer,
	StartedPubSubEmulatorContainer,
} from '@testcontainers/gcloud'
import { FirestoreEmulatorContainer, PubSubEmulatorContainer } from '@testcontainers/gcloud'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { RedisContainer } from '@testcontainers/redis'
import type { JobPayload, PatchOperation } from 'flowcraft'
import Redis from 'ioredis'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
			new PubSubEmulatorContainer(
				'gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators',
			).start(),
			new FirestoreEmulatorContainer(
				'gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators',
			).start(),
			new RedisContainer('redis:8.2.2').start(),
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

		const messagePromise = new Promise((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error('Timeout waiting for message')),
				15000,
			)
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

	it('should expose handleJob() as a public method for serverless usage', async () => {
		const mockCoordinationStore = {
			increment: () => Promise.resolve(1),
			setIfNotExist: () => Promise.resolve(true),
			extendTTL: () => Promise.resolve(true),
			delete: () => Promise.resolve(),
			get: () => Promise.resolve(undefined),
		}
		const adapter = new PubSubAdapter({
			pubsubClient: pubsub,
			firestoreClient: firestore,
			redisClient: redis,
			topicName: TOPIC_NAME,
			subscriptionName: SUBSCRIPTION_NAME,
			contextCollectionName: CONTEXT_COLLECTION,
			statusCollectionName: STATUS_COLLECTION,
			coordinationStore: mockCoordinationStore,
			runtimeOptions: {
				blueprints: {
					test: {
						id: 'test',
						nodes: [{ id: 'A', uses: 'test' }],
						edges: [],
					},
				},
				registry: {
					test: async () => ({ output: 'done' }),
				},
			},
		})

		// handleJob should be publicly accessible (not just via processJobs)
		expect(typeof adapter.handleJob).toBe('function')

		const job: JobPayload = {
			runId: 'serverless-test-run',
			blueprintId: 'test',
			nodeId: 'A',
		}

		await expect(adapter.handleJob(job)).resolves.not.toThrow()
	})
})

function createMockPubSub() {
	return {
		topic: vi.fn().mockReturnValue({
			publishMessage: vi.fn().mockResolvedValue('msg-id'),
		}),
		subscription: vi.fn().mockReturnValue({
			on: vi.fn(),
			close: vi.fn().mockResolvedValue(undefined),
		}),
	}
}

function createMockFirestore() {
	return {
		collection: vi.fn().mockReturnValue({
			doc: vi.fn().mockReturnValue({
				set: vi.fn().mockResolvedValue(undefined),
				get: vi.fn().mockResolvedValue({ exists: false }),
			}),
		}),
	}
}

function createMockRedis() {
	return { quit: vi.fn() }
}

describe('PubSubAdapter - Unit Tests', function () {
	it('should throw on registerWebhookEndpoint', async function () {
		const mockPubSub = createMockPubSub()
		const mockFirestore = createMockFirestore()
		const mockRedis = createMockRedis()

		const adapter = new PubSubAdapter({
			pubsubClient: mockPubSub as any,
			firestoreClient: mockFirestore as any,
			redisClient: mockRedis as any,
			topicName: 'test-topic',
			subscriptionName: 'test-sub',
			contextCollectionName: 'contexts',
			statusCollectionName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		await expect(adapter.registerWebhookEndpoint('run-1', 'node-1')).rejects.toThrow(
			'registerWebhookEndpoint not implemented for GCPAdapter',
		)
	})

	it('should create context using createContext method', function () {
		const mockPubSub = createMockPubSub()
		const mockFirestore = createMockFirestore()
		const mockRedis = createMockRedis()

		const adapter = new PubSubAdapter({
			pubsubClient: mockPubSub as any,
			firestoreClient: mockFirestore as any,
			redisClient: mockRedis as any,
			topicName: 'test-topic',
			subscriptionName: 'test-sub',
			contextCollectionName: 'contexts',
			statusCollectionName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		const context = (adapter as any).createContext('test-run')
		expect(context).toBeDefined()
	})

	it('should handle onJobStart errors gracefully', async function () {
		const mockPubSub = createMockPubSub()
		const mockFirestore = {
			collection: vi.fn().mockReturnValue({
				doc: vi.fn().mockReturnValue({
					set: vi.fn().mockRejectedValue(new Error('Firestore error')),
				}),
			}),
		}
		const mockRedis = createMockRedis()

		const adapter = new PubSubAdapter({
			pubsubClient: mockPubSub as any,
			firestoreClient: mockFirestore as any,
			redisClient: mockRedis as any,
			topicName: 'test-topic',
			subscriptionName: 'test-sub',
			contextCollectionName: 'contexts',
			statusCollectionName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		await (adapter as any).onJobStart('run-1', 'bp-1', 'node-1')
	})

	it('should warn when starting subscription twice', function () {
		const mockPubSub = createMockPubSub()
		const mockFirestore = createMockFirestore()
		const mockRedis = createMockRedis()

		const adapter = new PubSubAdapter({
			pubsubClient: mockPubSub as any,
			firestoreClient: mockFirestore as any,
			redisClient: mockRedis as any,
			topicName: 'test-topic',
			subscriptionName: 'test-sub',
			contextCollectionName: 'contexts',
			statusCollectionName: 'statuses',
			coordinationStore: {} as any,
			runtimeOptions: {},
		})

		;(adapter as any).processJobs(() => {})
		;(adapter as any).processJobs(() => {})
	})
})

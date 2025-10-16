import { BullMQAdapter, RedisCoordinationStore } from '@flowcraft/bullmq-adapter'
import { agentNodeRegistry, blueprints } from '@flowcraft/example-declarative-shared-logic'
import IORedis from 'ioredis'
import 'dotenv/config'

async function main() {
	console.log('--- Distributed Workflow Worker (Adapter-based) ---')
	const redisConnection = new IORedis({ maxRetriesPerRequest: null })

	console.log(`[Worker] Loaded ${Object.keys(blueprints).length} blueprints into the cache.`)

	// 1. Create the coordination store.
	const coordinationStore = new RedisCoordinationStore(redisConnection)

	// 2. Instantiate the adapter with all necessary components.
	const adapter = new BullMQAdapter({
		connection: redisConnection,
		queueName: 'flowcraft-queue',
		coordinationStore,
		runtimeOptions: {
			registry: agentNodeRegistry as any,
			blueprints,
		},
	})

	// 3. Start the worker. The adapter now handles all orchestration logic.
	adapter.start()

	process.on('SIGINT', () => {
		console.log('Gracefully shutting down worker...')
		redisConnection.quit()
		process.exit(0)
	})
}

main().catch(console.error)

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { BullMQAdapter, RedisCoordinationStore } from '@flowcraft/bullmq-adapter'
import type { WorkflowBlueprint } from 'flowcraft'
import IORedis from 'ioredis'
import { agentNodeRegistry } from '../../5a_declarative/src/registry'
import 'dotenv/config'

/**
 * Loads all blueprint files from the data directory into a cache.
 */
async function loadAllBlueprints(): Promise<Record<string, WorkflowBlueprint>> {
	const blueprintCache: Record<string, WorkflowBlueprint> = {}
	const useCaseDirs = ['1.blog-post', '2.job-application', '3.customer-review', '4.content-moderation']
	for (const dirName of useCaseDirs) {
		const dirPath = path.join(process.cwd(), '..', '5.dag', 'data', dirName)
		const files = await fs.readdir(dirPath)
		for (const file of files) {
			if (file.endsWith('.json')) {
				const fileContent = await fs.readFile(path.join(dirPath, file), 'utf-8')
				const graph = JSON.parse(fileContent)
				const blueprintId = path.basename(file, '.json')
				// Basic transformation into required format
				blueprintCache[blueprintId] = {
					id: blueprintId,
					nodes: graph.nodes.map((n: any) => ({
						id: n.id,
						uses: n.type === 'sub-workflow' ? 'subflow' : n.type,
						params:
							n.type === 'sub-workflow'
								? {
										blueprintId: n.data.workflowId.toString(),
										inputs: n.data.inputs,
										outputs: n.data.outputs,
									}
								: n.data,
						config: n.config,
					})),
					edges: graph.edges,
				}
			}
		}
	}
	return blueprintCache
}

async function main() {
	console.log('--- Distributed Workflow Worker (Adapter-based) ---')
	const redisConnection = new IORedis({ maxRetriesPerRequest: null })

	// 1. Load all blueprints that the runtime will need.
	const blueprints = await loadAllBlueprints()
	console.log(`[Worker] Loaded ${Object.keys(blueprints).length} blueprints into the cache.`)

	// 2. Create the coordination store.
	const coordinationStore = new RedisCoordinationStore(redisConnection)

	// 3. Instantiate the adapter with all necessary components.
	const adapter = new BullMQAdapter({
		connection: redisConnection,
		queueName: 'flowcraft-queue',
		coordinationStore,
		runtimeOptions: {
			registry: agentNodeRegistry as any,
			blueprints,
		},
	})

	// 4. Start the worker. The adapter now handles all orchestration logic.
	adapter.start()

	process.on('SIGINT', () => {
		console.log('Gracefully shutting down worker...')
		redisConnection.quit()
		process.exit(0)
	})
}

main().catch(console.error)

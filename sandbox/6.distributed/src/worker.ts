import type { Job } from 'bullmq'
import type { IEventBus, NodeDefinition, WorkflowBlueprint } from 'flowcraft'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import { Queue, Worker } from 'bullmq'
import { FlowRuntime } from 'flowcraft'
import IORedis from 'ioredis'
import { agentNodeRegistry } from '../../5.dag/src/registry.js'
import { RedisContext } from './RedisContext.js'
import 'dotenv/config'

const QUEUE_NAME = 'flowcraft-queue'
const STATUS_KEY_PREFIX = 'workflow:status:'

/**
 * A simple event bus that logs to the console for observability inside the worker.
 */
class ConsoleEventBus implements IEventBus {
	emit(eventName: string, payload: Record<string, any>): void {
		console.log(`[EventBus] Event: "${eventName}"`, payload)
	}
}

/**
 * Loads a declarative JSON graph and transforms it into the WorkflowBlueprint format.
 */
async function loadBlueprint(filePath: string): Promise<WorkflowBlueprint> {
	const fileContent = await fs.readFile(filePath, 'utf-8')
	const graph = JSON.parse(fileContent)
	const blueprintId = path.basename(filePath, '.json')

	const nodes: NodeDefinition[] = graph.nodes.map((node: any) => {
		const def: NodeDefinition = {
			id: node.id,
			uses: node.type,
			params: node.data,
			config: node.config,
		}

		// If the old format uses 'sub-workflow', map it to the built-in 'subflow'
		if (def.uses === 'sub-workflow') {
			def.uses = 'subflow'
			// And restructure its params to match what the 'subflow' node expects
			def.params = {
				blueprintId: node.data.workflowId.toString(),
				inputs: node.data.inputs,
				outputs: node.data.outputs,
			}
		}

		return def
	})

	return { id: blueprintId, nodes, edges: graph.edges }
}

async function main() {
	console.log('--- Distributed Workflow Worker ---')
	const redisConnection = new IORedis({ maxRetriesPerRequest: null })

	// Load all blueprints into a simple cache
	const blueprintCache: Record<string, WorkflowBlueprint> = {}
	const useCaseDirs = ['1.blog-post', '2.job-application', '3.customer-review', '4.content-moderation']
	for (const dirName of useCaseDirs) {
		const dirPath = path.join(process.cwd(), '..', '5.dag', 'data', dirName)
		const files = await fs.readdir(dirPath)
		for (const file of files) {
			if (file.endsWith('.json')) {
				const blueprint = await loadBlueprint(path.join(dirPath, file))
				blueprintCache[blueprint.id] = blueprint
			}
		}
	}
	console.log('[Worker] All blueprints loaded and registered.')

	const runtime = new FlowRuntime({
		registry: agentNodeRegistry,
		blueprints: blueprintCache,
		eventBus: new ConsoleEventBus(),
	})

	const worker = new Worker(QUEUE_NAME, async (job: Job) => {
		console.log(`[Worker] ==> Picked up job ID: ${job.id}, Name: ${job.name}`)

		if (job.name !== 'executeNode') {
			console.log(`[Worker] Skipping job with unknown name: ${job.name}`)
			return
		}

		const { runId, blueprintId, nodeId } = job.data
		const statusKey = `${STATUS_KEY_PREFIX}${runId}`

		const blueprint = blueprintCache[blueprintId]
		if (!blueprint)
			throw new Error(`Blueprint '${blueprintId}' not found.`)

		const context = new RedisContext(redisConnection, runId)

		// This is a minimal mock of the WorkflowState object, allowing us to use
		// the runtime's powerful `executeNode` method with our distributed RedisContext.
		const mockState = {
			getContext: () => context,
			markFallbackExecuted: () => { }, // In a real scenario, this might set a Redis flag
		} as any

		try {
			// 1. Execute the single node using the core runtime's resilient logic.
			const result = await runtime.executeNode(blueprint, nodeId, mockState)

			// 2. Persist the node's output back to the distributed context.
			await context.set(nodeId as any, result.output)

			// 3. Determine the next nodes to run based on the result.
			const nextNodes = await runtime.determineNextNodes(blueprint, nodeId, result, context)

			if (nextNodes.length > 0) {
				const queue = new Queue(QUEUE_NAME, { connection: redisConnection })
				for (const { node: nextNodeDef, edge } of nextNodes) {
					// Apply any edge transforms before checking for fan-in
					await runtime.applyEdgeTransform(edge, result, nextNodeDef, context)

					// --- DISTRIBUTED FAN-IN LOGIC ---
					const joinStrategy = nextNodeDef.config?.joinStrategy || 'all'
					const predecessors = blueprint.edges.filter((e: any) => e.target === nextNodeDef.id)
					let isReadyToEnqueue = false

					if (predecessors.length <= 1) {
						isReadyToEnqueue = true
					}
					else if (joinStrategy === 'any') {
						const lockKey = `workflow:joinlock:${runId}:${nextNodeDef.id}`
						// Attempt to acquire a lock; if successful, this is the first branch to arrive.
						const lockAcquired = await redisConnection.set(lockKey, 'true', 'EX', 3600, 'NX')
						if (lockAcquired)
							isReadyToEnqueue = true
					}
					else { // 'all' strategy
						const fanInKey = `workflow:fanin:${runId}:${nextNodeDef.id}`
						const readyCount = await redisConnection.incr(fanInKey)
						await redisConnection.expire(fanInKey, 3600) // Prevent old keys from sticking around

						if (readyCount >= predecessors.length) {
							isReadyToEnqueue = true
							await redisConnection.del(fanInKey) // Clean up counter
						}
						else {
							console.log(`[Worker] Node ${nextNodeDef.id} waiting for fan-in (${readyCount}/${predecessors.length} complete).`)
						}
					}

					if (isReadyToEnqueue) {
						await queue.add('executeNode', { runId, blueprintId, nodeId: nextNodeDef.id })
						console.log(`[Worker] Enqueued job for node: ${nextNodeDef.id}.`)
					}
					// --- END FAN-IN LOGIC ---
				}
				await queue.close()
			}
			else {
				// 4. This is a terminal node. If it's the designated output node, the workflow is complete.
				console.log(`[Worker] Node ${nodeId} is a terminal node for Run ID ${runId}.`)
				const nodeDef = blueprint.nodes.find((n: any) => n.id === nodeId)

				if (nodeDef?.uses === 'output') {
					const finalContext = await context.toJSON()
					await redisConnection.set(statusKey, JSON.stringify({ status: 'completed', payload: { context: finalContext } }), 'EX', 3600)
					console.log(`[Worker] ✅ Workflow completed for Run ID: ${runId}`)
				}
			}
		}
		catch (error: any) {
			const reason = error.message || 'Unknown error'
			console.error(`[Worker] ❌ Node ${nodeId} failed for Run ID ${runId}: ${reason}`)
			await redisConnection.set(statusKey, JSON.stringify({ status: 'failed', reason }), 'EX', 3600)
		}
	}, { connection: redisConnection, concurrency: 5 })

	console.log(`Worker listening for 'executeNode' jobs on queue: "${QUEUE_NAME}"`)

	// Setup cancellation listener
	readline.emitKeypressEvents(process.stdin)
	if (process.stdin.isTTY)
		process.stdin.setRawMode(true)

	console.log('... Press "c" to cancel a running workflow, or CTRL+C to exit ...')
	process.stdin.on('keypress', (_, key) => {
		if (key.ctrl && key.name === 'c') {
			console.log('Gracefully shutting down worker...')
			worker.close().then(() => process.exit(0))
		}
		if (key.name === 'c') {
			const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
			rl.question('Enter Run ID to cancel: ', async (runId) => {
				if (runId) {
					// This example uses polling for cancellation. A more advanced system
					// might use Redis Pub/Sub for instant cancellation.
					const statusKey = `${STATUS_KEY_PREFIX}${runId}`
					await redisConnection.set(statusKey, JSON.stringify({ status: 'cancelled', reason: 'Manually cancelled by operator.' }), 'EX', 3600)
					console.log(`[Worker] Signaled cancellation for Run ID: ${runId}`)
				}
				rl.close()
			})
		}
	})
}

main().catch(console.error)

import type { Job } from 'bullmq'
import type { IEventBus, NodeDefinition, WorkflowBlueprint } from 'flowcraft'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import { Queue, Worker } from 'bullmq'
import { FlowcraftRuntime } from 'flowcraft'
import IORedis from 'ioredis'
import { BullMQContext } from './BullMQContext.js'
import { agentNodeRegistry } from './registry.js'
import 'dotenv/config'

const QUEUE_NAME = 'flowcraft-queue'
const CANCELLATION_KEY_PREFIX = 'workflow:cancel:'
const STATUS_KEY_PREFIX = 'workflow:status:'

// A simple event bus that logs to the console for observability inside the worker.
class ConsoleEventBus implements IEventBus {
	emit(eventName: string, payload: Record<string, any>): void {
		console.log(`[EventBus] Event: "${eventName}"`, payload)
	}
}

async function loadBlueprint(filePath: string): Promise<WorkflowBlueprint> {
	const fileContent = await fs.readFile(filePath, 'utf-8')
	const graph = JSON.parse(fileContent)
	const blueprintId = path.basename(filePath, '.json')

	const nodes: NodeDefinition[] = graph.nodes.map((v1Node: any) => {
		if (v1Node.type === 'sub-workflow') {
			return {
				id: v1Node.id,
				uses: 'subflow',
				params: { blueprintId: v1Node.data.workflowId.toString(), inputs: v1Node.data.inputs, outputs: v1Node.data.outputs },
			}
		}
		return {
			id: v1Node.id,
			uses: v1Node.type,
			params: v1Node.data,
			config: v1Node.config,
		}
	})
	return { id: blueprintId, nodes, edges: graph.edges }
}

async function main() {
	console.log('--- Distributed Workflow Worker ---')
	const redisConnection = new IORedis({ maxRetriesPerRequest: null })
	const runtime = new FlowcraftRuntime({
		registry: agentNodeRegistry,
		eventBus: new ConsoleEventBus(),
	})

	// Load all blueprints into the runtime cache
	const useCaseDirs = ['1.blog-post', '2.job-application', '3.customer-review', '4.content-moderation']
	for (const dirName of useCaseDirs) {
		const dirPath = path.join(process.cwd(), 'data', dirName)
		const files = await fs.readdir(dirPath)
		for (const file of files) {
			if (file.endsWith('.json')) {
				const blueprint = await loadBlueprint(path.join(dirPath, file))
				runtime.registerBlueprint(blueprint)
			}
		}
	}
	console.log('[Worker] All blueprints loaded and registered.')

	const worker = new Worker(QUEUE_NAME, async (job: Job) => {
		console.log(`[Worker] ==> Picked up job ID: ${job.id}, Name: ${job.name}`)

		if (job.name !== 'executeNode') {
			console.log(`[Worker] Skipping job with unknown name: ${job.name}`)
			return
		}

		const { runId, blueprintId, nodeId } = job.data
		const statusKey = `${STATUS_KEY_PREFIX}${runId}`

		const blueprint = runtime.getBlueprint(blueprintId)
		if (!blueprint) {
			throw new Error(`Blueprint '${blueprintId}' not found.`)
		}

		// Create a new distributed context for this specific node execution
		const metadata = {
			executionId: runId,
			blueprintId,
			currentNodeId: nodeId,
			startedAt: new Date(),
			environment: 'development' as const,
		}
		const context = new BullMQContext(redisConnection, runId, metadata)

		try {
			// 1. Execute the single node with full resiliency
			const result = await runtime.executeNode(blueprint, nodeId, context)

			// FIX: Only store the node's output if it's not undefined
			if (result.output !== undefined) {
				await context.set(nodeId as any, result.output)
			}

			// 2. Determine the next nodes to run
			const nextNodes = await runtime.determineNextNodes(blueprint, nodeId, result, context)

			if (nextNodes.length > 0) {
				// 3. Enqueue jobs for the next nodes with corrected fan-in logic
				const queue = new Queue(QUEUE_NAME, { connection: redisConnection })
				for (const nextNode of nextNodes) {
					// --- CORRECTED FAN-IN LOGIC ---
					const nodeDef = blueprint.nodes.find((n: any) => n.id === nextNode.id)
					const joinStrategy = nodeDef?.config?.joinStrategy || 'all' // Default to 'all'

					let isReadyToEnqueue = false

					if (joinStrategy === 'any') {
						// For 'any' (used after a router), the first branch to arrive wins
						const lockKey = `workflow:joinlock:${runId}:${nextNode.id}`
						const lockAcquired = await redisConnection.set(lockKey, 'true', 'EX', 3600, 'NX')
						if (lockAcquired) {
							isReadyToEnqueue = true
						}
					}
					else { // 'all' strategy
						const predecessors = blueprint.edges.filter((e: any) => e.target === nextNode.id)
						const fanInKey = `workflow:fanin:${runId}:${nextNode.id}`
						const readyCount = await redisConnection.incr(fanInKey)
						await redisConnection.expire(fanInKey, 3600) // Set expiration

						if (readyCount >= predecessors.length) {
							isReadyToEnqueue = true
							await redisConnection.del(fanInKey) // Clean up counter
						}
						else {
							console.log(`[Worker] Node ${nextNode.id} waiting for fan-in (${readyCount}/${predecessors.length} complete).`)
						}
					}

					if (isReadyToEnqueue) {
						const nextJob = { name: 'executeNode', data: { runId, blueprintId, nodeId: nextNode.id } }
						await queue.add(nextJob.name, nextJob.data)
						console.log(`[Worker] Enqueued job for node: ${nextNode.id}.`)
					}
					// --- END FAN-IN LOGIC ---
				}
				await queue.close()
			}
			else {
				// 4. This is a terminal node (no outgoing edges)
				console.log(`[Worker] Node ${nodeId} is a terminal node for Run ID ${runId}.`)
				const nodeDef = blueprint.nodes.find((n: any) => n.id === nodeId)

				// If it's the designated 'output' node, signal workflow completion
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
	console.log('... Press "c" to cancel a running workflow ...')
	process.stdin.on('keypress', (_, key) => {
		if (key.ctrl && key.name === 'c') {
			worker.close().then(() => process.exit(0))
		}
		if (key.name === 'c') {
			const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
			rl.question('Enter Run ID to cancel: ', async (runId) => {
				if (runId) {
					console.log(`Signaling cancellation for Run ID: ${runId}`)
					await redisConnection.set(`${CANCELLATION_KEY_PREFIX}${runId}`, 'true', 'EX', 3600)
				}
				rl.close()
			})
		}
	})
}

main().catch(console.error)

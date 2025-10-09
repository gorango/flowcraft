import type { Job } from 'bullmq'
import type { IEventBus, NodeDefinition, WorkflowBlueprint, WorkflowResult } from 'flowcraft'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import { Worker } from 'bullmq'
import { FlowcraftRuntime } from 'flowcraft'
import IORedis from 'ioredis'
import { agentNodeRegistry } from './registry.js'
import 'dotenv/config'

const QUEUE_NAME = 'flowcraft-v2-queue'
const CANCELLATION_KEY_PREFIX = 'workflow:cancel:v2:'
const STATUS_KEY_PREFIX = 'workflow:status:'

// A simple event bus that logs to the console for observability inside the worker.
class ConsoleEventBus implements IEventBus {
	emit(eventName: string, payload: Record<string, any>): void {
		console.log(`[EventBus] Event: "${eventName}"`, payload)
	}
}

// --- V1 to V2 Blueprint Loader (reused from sandbox/4.dag) ---
async function loadBlueprint(filePath: string): Promise<WorkflowBlueprint> {
	const fileContent = await fs.readFile(filePath, 'utf-8')
	const v1Graph = JSON.parse(fileContent)
	const blueprintId = path.basename(filePath, '.json')

	const v2Nodes: NodeDefinition[] = v1Graph.nodes.map((v1Node: any) => {
		if (v1Node.type === 'sub-workflow') {
			return {
				id: v1Node.id,
				uses: 'subflow',
				params: { blueprintId: v1Node.data.workflowId.toString(), inputs: v1Node.data.inputs, outputs: v1Node.data.outputs },
			}
		}
		return { id: v1Node.id, uses: v1Node.type, params: v1Node.data }
	})
	return { id: blueprintId, nodes: v2Nodes, edges: v1Graph.edges }
}

// --- Main Worker Logic ---
async function main() {
	console.log('--- Distributed Workflow Worker V2 ---')
	const redisConnection = new IORedis({ maxRetriesPerRequest: null })
	const runtime = new FlowcraftRuntime({
		registry: agentNodeRegistry,
		eventBus: new ConsoleEventBus(), // Add the console logger
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
		// --- DIAGNOSTIC LOGGING ---
		console.log(`[Worker] ==> Picked up job ID: ${job.id}, Name: ${job.name}`)

		if (job.name !== 'runWorkflow') {
			console.log(`[Worker] Skipping job with unknown name: ${job.name}`)
			return
		}

		const { runId, blueprintId, initialContext } = job.data
		const statusKey = `${STATUS_KEY_PREFIX}${runId}`
		const cancellationKey = `${CANCELLATION_KEY_PREFIX}${runId}`

		console.log(`[Orchestrator] Starting workflow '${blueprintId}' for Run ID: ${runId}`)

		const mainBlueprint = runtime.getBlueprint(blueprintId)
		if (!mainBlueprint) {
			throw new Error(`[Orchestrator] Blueprint '${blueprintId}' not found.`)
		}

		// Set up cancellation polling
		const controller = new AbortController()
		const pollInterval = setInterval(async () => {
			if (await redisConnection.get(cancellationKey)) {
				console.warn(`[Orchestrator] Abort signal received for Run ID ${runId}. Aborting...`)
				controller.abort()
				clearInterval(pollInterval)
			}
		}, 500)

		const startTime = new Date()
		try {
			const result: WorkflowResult = await runtime.run(mainBlueprint, initialContext, undefined, controller.signal)
			await redisConnection.set(statusKey, JSON.stringify({ status: 'completed', payload: result }), 'EX', 3600)
			console.log(`[Orchestrator] ✅ Finished workflow for Run ID: ${runId}`)
		}
		catch (error: any) {
			const reason = error.message || 'Unknown error'
			const status = error.name === 'CancelledWorkflowError' ? 'cancelled' : 'failed'
			const finalError = {
				metadata: { status, duration: Date.now() - startTime.getTime() },
				error: { nodeId: error.nodeId || 'orchestrator', message: reason },
			}
			console.error(`[Orchestrator] ❌ Workflow failed for Run ID ${runId}: ${reason}`)
			await redisConnection.set(statusKey, JSON.stringify({ status, reason, payload: finalError }), 'EX', 3600)
		}
		finally {
			clearInterval(pollInterval)
			await redisConnection.del(cancellationKey)
		}
	}, { connection: redisConnection, concurrency: 5 })

	console.log(`Worker listening on queue: "${QUEUE_NAME}"`)

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

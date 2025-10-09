import type { WorkflowBlueprint } from 'flowcraft/v2'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import { Worker } from 'bullmq'
import { FlowcraftRuntime } from 'flowcraft/v2'
import IORedis from 'ioredis'
import { agentNodeRegistry } from './registry.js'
import 'dotenv/config'

const QUEUE_NAME = 'flowcraft-v2-queue'
const CANCELLATION_KEY_PREFIX = 'workflow:cancel:v2:'

// --- V1 to V2 Blueprint Loader (reused from sandbox/4.dag) ---
async function loadBlueprint(filePath: string): Promise<WorkflowBlueprint> {
	const fileContent = await fs.readFile(filePath, 'utf-8')
	const v1Graph = JSON.parse(fileContent)
	const blueprintId = path.basename(filePath, '.json')

	const v2Nodes = v1Graph.nodes.map((v1Node: any) => {
		if (v1Node.type === 'sub-workflow') {
			return {
				id: v1Node.id,
				uses: 'subflow',
				params: { blueprintId: v1Node.data.workflowId, inputs: v1Node.data.inputs, outputs: v1Node.data.outputs },
				config: v1Node.config,
			}
		}
		return {
			id: v1Node.id,
			uses: v1Node.type,
			params: v1Node.data,
			config: v1Node.config,
		}
	})

	const nodeIds = new Set(v2Nodes.map((n: any) => n.id))
	const targetIds = new Set(v1Graph.edges.map((e: any) => e.target))
	const startNodeIds = Array.from(nodeIds).filter(id => !targetIds.has(id))

	if (startNodeIds.length > 1) {
		const parallelContainerId = `__parallel_start_${blueprintId}`
		v2Nodes.push({
			id: parallelContainerId,
			uses: 'parallel-container',
			params: { branches: startNodeIds },
		})
		const newEdges = v1Graph.edges.filter((edge: any) => !startNodeIds.includes(edge.source))
		const successors = new Set(v1Graph.edges.filter((edge: any) => startNodeIds.includes(edge.source)).map((edge: any) => edge.target))
		successors.forEach((successorId) => {
			newEdges.push({ source: parallelContainerId, target: successorId })
		})
		return { id: blueprintId, nodes: v2Nodes, edges: newEdges }
	}

	return { id: blueprintId, nodes: v2Nodes, edges: v1Graph.edges }
}

// --- Main Worker Logic ---
async function main() {
	console.log('--- Distributed Workflow Worker V2 ---')
	const redisConnection = new IORedis({ maxRetriesPerRequest: null })

	const runtime = new FlowcraftRuntime({
		registry: agentNodeRegistry,
		environment: 'development',
	})

	// Load and register all blueprints from all use-case directories
	const useCaseDirs = ['1.blog-post', '2.job-application', '3.customer-review', '4.content-moderation']
	for (const dirName of useCaseDirs) {
		const dirPath = path.join(process.cwd(), 'data', dirName)
		const files = await fs.readdir(dirPath)
		for (const file of files) {
			if (file.endsWith('.json')) {
				const blueprint = await loadBlueprint(path.join(dirPath, file))
				runtime.registerBlueprint(blueprint)
				console.log(`[Worker] Loaded blueprint: ${blueprint.id}`)
			}
		}
	}

	const worker = new Worker(QUEUE_NAME, async (job) => {
		if (job.name !== 'runWorkflow')
			return

		const { runId, blueprintId, initialContext } = job.data
		const statusKey = `workflow:status:${runId}`
		const cancellationKey = `${CANCELLATION_KEY_PREFIX}${runId}`

		console.log(`[Worker] Processing workflow '${blueprintId}' for Run ID: ${runId}`)

		const blueprint = runtime.getBlueprint(blueprintId)
		if (!blueprint)
			throw new Error(`Blueprint '${blueprintId}' not found.`)

		const controller = new AbortController()
		const pollInterval = setInterval(async () => {
			if (await redisConnection.get(cancellationKey) === 'true') {
				console.warn(`[Worker] Abort signal received for Run ID ${runId}. Aborting...`)
				controller.abort()
				clearInterval(pollInterval)
			}
		}, 500)

		try {
			const result = await runtime.run(blueprint, initialContext, undefined, controller.signal)
			await redisConnection.set(statusKey, JSON.stringify({ status: 'completed', payload: result }), 'EX', 3600)
			console.log(`[Worker] ✅ Finished workflow for Run ID: ${runId}`)
		}
		catch (error: any) {
			const reason = error.message || 'Unknown error'
			const status = error.name === 'CancelledWorkflowError' ? 'cancelled' : 'failed'
			console.error(`[Worker] ❌ Workflow failed for Run ID ${runId}: ${reason}`)
			await redisConnection.set(statusKey, JSON.stringify({ status, reason }), 'EX', 3600)
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
		if (key.ctrl && key.name === 'c')
			process.exit()
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

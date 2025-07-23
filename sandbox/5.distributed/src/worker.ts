import type { AbstractNode, NodeArgs } from 'cascade'
import type { NodeJobPayload } from './types'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import { Queue, Worker } from 'bullmq'
import { ConsoleLogger, Flow, TypedContext } from 'cascade'
import IORedis from 'ioredis'
import { WorkflowRegistry } from './registry'
import { RUN_ID } from './types'
import 'dotenv/config'

const QUEUE_NAME = 'distributed-cascade-queue'
const CANCELLATION_KEY_PREFIX = 'workflow:cancel:'

function getCancellationKey(runId: string) {
	return `${CANCELLATION_KEY_PREFIX}${runId}`
}

async function setupCancellationListener(redis: IORedis, logger: ConsoleLogger) {
	readline.emitKeypressEvents(process.stdin)
	if (process.stdin.isTTY)
		process.stdin.setRawMode(true)

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})

	logger.info('... Press \'c\' to cancel a running workflow ...')

	process.stdin.on('keypress', (str, key) => {
		if (key.ctrl && key.name === 'c') {
			process.exit()
		}

		// Handle the cancellation prompt.
		if (key.name === 'c') {
			// Create a new readline interface *only when needed*.
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
			})

			// Clear the "c" that was just typed.
			readline.clearLine(process.stdout, 0)
			readline.cursorTo(process.stdout, 0)

			rl.question('Enter Run ID to cancel: ', async (runId) => {
				if (runId) {
					logger.warn(`Signaling cancellation for Run ID: ${runId}`)
					await redis.set(getCancellationKey(runId), 'true', 'EX', 3600)
				}
				rl.close()
			})
		}
	})
}

async function main() {
	const logger = new ConsoleLogger()
	logger.info('--- Distributed Workflow Worker ---')

	// The worker needs its own connection and registry instance.
	const redisConnection = new IORedis({ maxRetriesPerRequest: null })
	const queue = new Queue(QUEUE_NAME, { connection: redisConnection })

	// The registry must be initialized with all possible use-cases the worker might encounter.
	// For this example, we load them all. In a real app, you might have different worker pools.
	const useCaseDirectories = [
		'1.blog-post',
		'2.job-application',
		'3.customer-review',
		'4.content-moderation',
	]
	const registries = await Promise.all(
		useCaseDirectories.map(dir => WorkflowRegistry.create(path.join(process.cwd(), 'data', dir))),
	)
	async function getNodeFromRegistries(workflowId: number, nodeId: string): Promise<AbstractNode | undefined> {
		for (const registry of registries) {
			try {
				const node = await registry.getNode(workflowId, nodeId)
				if (node)
					return node
			}
			catch (e) { /* Node not in this registry */ }
		}
		return undefined
	}

	// Setup the keyboard listener
	setupCancellationListener(redisConnection, logger)

	logger.info(`Worker listening on queue: "${QUEUE_NAME}"`)

	const worker = new Worker<NodeJobPayload>(QUEUE_NAME, async (job) => {
		const { runId, workflowId, nodeId, context: serializedContext, params } = job.data
		logger.info(`[Worker] Processing job: ${job.name} (Workflow: ${workflowId}, Run: ${runId})`)

		// 1. Check for cancellation signal BEFORE doing any work.
		const isCancelled = await redisConnection.get(getCancellationKey(runId))
		if (isCancelled === 'true') {
			logger.warn(`[Worker] Job for Run ID ${runId} was cancelled. Aborting execution.`)
			return
		}

		// 2. Find the executable node instance.
		const node = await getNodeFromRegistries(workflowId, nodeId)
		if (!node) {
			throw new Error(`Node '${nodeId}' in workflow '${workflowId}' not found.`)
		}

		// 3. Rehydrate context.
		const context = new TypedContext(Object.entries(serializedContext))
		context.set(RUN_ID, runId)

		// 4. Execute the node.
		const action = await node._run(context, params, undefined, logger)

		// 5. Determine and enqueue the next node(s).
		const successor = node.successors.get(action)
		if (!successor) {
			logger.info(`[Worker] Branch complete for run ${runId}. Node '${nodeId}' returned action '${String(action)}' with no successor.`)
			return
		}

		const updatedContext = Object.fromEntries(context.entries())
		const isParallel = successor instanceof Flow
		const nodesToEnqueue = isParallel ? (successor as any).nodesToRun : [successor]

		logger.info(`[Worker] Enqueuing ${nodesToEnqueue.length} successor(s) for run ${runId} after action '${String(action)}'.`)

		for (const nextNode of nodesToEnqueue) {
			const nextNodeId = nextNode.id!
			await queue.add(nextNodeId, {
				runId,
				workflowId,
				nodeId: nextNodeId,
				context: updatedContext,
				params,
			})
		}
	}, { connection: redisConnection })

	worker.on('failed', (job, err) => {
		logger.error(`Job ${job?.id} failed with error: ${err.message}`, { job, err })
	})
}

main().catch(console.error)

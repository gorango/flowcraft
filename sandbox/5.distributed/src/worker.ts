import type { AbstractNode } from 'cascade'
import type { NodeJobPayload } from './types'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import { Queue, Worker } from 'bullmq'
import { AbortError, ConsoleLogger, Flow, TypedContext } from 'cascade'
import IORedis from 'ioredis'
import { WorkflowRegistry } from './registry'
import { FINAL_ACTION, RUN_ID } from './types'
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

	logger.info('... Press \'c\' to cancel a running workflow ...')

	process.stdin.on('keypress', (_str, key) => {
		if (key.ctrl && key.name === 'c') {
			process.exit()
		}

		// Handle the cancellation prompt.
		if (key.name === 'c') {
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

	const nodeOptionsContext = { queue, redis: redisConnection }

	// The registry must be initialized with all possible use-cases the worker might encounter.
	// For this example, we load them all. In a real app, you might have different worker pools.
	const useCaseDirectories = [
		'1.blog-post',
		'2.job-application',
		'3.customer-review',
		'4.content-moderation',
	]
	const registries = await Promise.all(
		useCaseDirectories.map(dir =>
			WorkflowRegistry.create(path.join(process.cwd(), 'data', dir), nodeOptionsContext),
		),
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

	async function getPredecessorCountFromRegistries(workflowId: number, nodeId: string): Promise<number> {
		for (const registry of registries) {
			try {
				await registry.getNode(workflowId, nodeId)
				return await registry.getPredecessorCount(workflowId, nodeId)
			}
			catch (e) { /* Graph not in this registry, which is expected */ }
		}
		return 0
	}

	setupCancellationListener(redisConnection, logger)
	logger.info(`Worker listening on queue: "${QUEUE_NAME}"`)

	const worker = new Worker<NodeJobPayload>(QUEUE_NAME, async (job) => {
		const { runId, workflowId, nodeId, context: serializedContext, params } = job.data
		const statusKey = `workflow:status:${runId}`
		const contextKey = `workflow:context:${runId}`
		logger.info(`[Worker] Processing job: ${job.name} (Workflow: ${workflowId}, Run: ${runId})`)

		const controller = new AbortController()
		const pollInterval = setInterval(async () => {
			const isCancelled = await redisConnection.get(getCancellationKey(runId))
			if (isCancelled === 'true') {
				logger.warn(`[Worker] Abort signal received for Run ID ${runId} during node execution. Aborting...`)
				controller.abort()
				clearInterval(pollInterval)
			}
		}, 500)

		try {
			if (controller.signal.aborted || await redisConnection.get(getCancellationKey(runId)) === 'true') {
				throw new AbortError(`Job for Run ID ${runId} was cancelled before starting.`)
			}

			const node = await getNodeFromRegistries(workflowId, nodeId)
			if (!node)
				throw new Error(`Node '${nodeId}' in workflow '${workflowId}' not found.`)

			const serializedContext = await redisConnection.get(contextKey)
			const context = serializedContext
				? new TypedContext(Object.entries(JSON.parse(serializedContext)))
				: new TypedContext(Object.entries(job.data.context))

			context.set(RUN_ID, runId)

			const action = await node._run({
				ctx: context,
				params,
				signal: controller.signal,
				logger,
			})

			await redisConnection.set(contextKey, JSON.stringify(Object.fromEntries(context.entries())))

			if (action === FINAL_ACTION) {
				logger.info(`[Worker] Final node executed for Run ID ${runId}. Reporting 'completed' status...`)
				const finalPayload = context.get('__final_payload')
				const statusPayload = { status: 'completed', payload: finalPayload ?? null }
				await redisConnection.set(statusKey, JSON.stringify(statusPayload), 'EX', 3600)
				await redisConnection.del(contextKey)
				return
			}

			if (controller.signal.aborted) {
				throw new AbortError(`Job for Run ID ${runId} was cancelled after execution, before enqueueing next step.`)
			}

			const successor = node.successors.get(action)

			if (!successor) {
				logger.info(`[Worker] Branch complete for run ${runId}. Node '${nodeId}' action has no successor.`)
				return // This branch is done.
			}

			const nodesToEnqueue = (successor instanceof Flow)
				? (successor as any).nodesToRun
				: [successor]

			logger.info(`[Worker] Enqueuing ${nodesToEnqueue.length} successor(s) for run ${runId}.`)
			for (const nextNode of nodesToEnqueue) {
				const nextNodeId = nextNode.id!
				// We pass an empty context because the full, authoritative context is now in Redis.
				await queue.add(nextNodeId, { runId, workflowId, nodeId: nextNodeId, context: {}, params })
			}
		}
		catch (error) {
			if (error instanceof AbortError) {
				logger.warn(`[Worker] Job for Run ID ${runId} was aborted. Reporting 'cancelled' status.`)
				const statusPayload = { status: 'cancelled', reason: error.message }
				if (await redisConnection.setnx(statusKey, JSON.stringify(statusPayload))) {
					await redisConnection.expire(statusKey, 3600)
					await redisConnection.del(contextKey)
				}
			}
			else {
				logger.error(`[Worker] Job for Run ID ${runId} failed. Reporting 'failed' status.`, { error })
				const statusPayload = { status: 'failed', reason: (error as Error).message }
				if (await redisConnection.setnx(statusKey, JSON.stringify(statusPayload))) {
					await redisConnection.expire(statusKey, 3600)
					await redisConnection.del(contextKey)
				}
				throw error
			}
		}
		finally {
			// 6. IMPORTANT: clear the polling interval.
			clearInterval(pollInterval)
		}
	}, {
		connection: redisConnection,
		concurrency: 5,
	})

	worker.on('failed', (job, err) => {
		logger.error(`Job ${job?.id} failed with error: ${err.message}`, { job, err })
	})
}

main().catch(console.error)

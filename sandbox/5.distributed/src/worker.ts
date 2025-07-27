import type { NodeJobPayload } from './types'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import { Queue, Worker } from 'bullmq'
import { AbortError, ConsoleLogger, Flow, TypedContext } from 'flowcraft'
import IORedis from 'ioredis'
import { WorkflowRegistry } from './registry'
import { FINAL_ACTION, RUN_ID } from './types'
import 'dotenv/config'

const QUEUE_NAME = 'distributed-flowcraft-queue'
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

		if (key.name === 'c') {
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
			})

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

	const redisConnection = new IORedis({ maxRetriesPerRequest: null })
	const queue = new Queue(QUEUE_NAME, { connection: redisConnection })

	// Define all use-case directories the worker should be aware of.
	const useCaseDirectories = [
		'1.blog-post',
		'2.job-application',
		'3.customer-review',
		'4.content-moderation',
	].map(dir => path.join(process.cwd(), 'data', dir))

	// Create and initialize the registry from all directories in one clean call.
	const masterRegistry = await WorkflowRegistry.create(useCaseDirectories)

	setupCancellationListener(redisConnection, logger)
	logger.info(`Worker listening on queue: "${QUEUE_NAME}"`)

	const worker = new Worker<NodeJobPayload>(QUEUE_NAME, async (job) => {
		const { runId, workflowId, nodeId, params } = job.data
		const statusKey = `workflow:status:${runId}`
		const contextKey = `workflow:context:${runId}`

		logger.info(`[Worker] Processing job: ${job.name} (Workflow: ${workflowId}, Run: ${runId})`)

		const controller = new AbortController()
		const pollInterval = setInterval(async () => {
			if (await redisConnection.get(getCancellationKey(runId)) === 'true') {
				logger.warn(`[Worker] Abort signal received for Run ID ${runId}. Aborting...`)
				controller.abort()
				clearInterval(pollInterval)
			}
		}, 500)

		try {
			if (controller.signal.aborted)
				throw new AbortError(`Job for Run ID ${runId} was cancelled before starting.`)

			const node = await masterRegistry.getNode(workflowId, nodeId)
			if (!node)
				throw new Error(`Node '${nodeId}' in workflow '${workflowId}' not found.`)

			// Load the most up-to-date context from the Redis hash.
			const contextData = await redisConnection.hgetall(contextKey)
			const context = new TypedContext()

			if (Object.keys(contextData).length === 0 && Object.keys(job.data.context).length > 0) {
				// This is the first node for this run. Persist the initial context from the job payload.
				const initialContextObject = job.data.context
				for (const [key, value] of Object.entries(initialContextObject))
					context.set(key, value)

				const serializedInitialContext = Object.entries(initialContextObject).flatMap(([key, value]) => [key, JSON.stringify(value)])
				if (serializedInitialContext.length > 0)
					await redisConnection.hset(contextKey, ...serializedInitialContext)
			}
			else {
				// For subsequent nodes, hydrate the context from the Redis hash.
				for (const [key, value] of Object.entries(contextData)) {
					try {
						context.set(key, JSON.parse(value))
					}
					catch {
						context.set(key, value) // Fallback for non-JSON strings
					}
				}
			}

			context.set(RUN_ID, runId)

			const action = await node._run({
				ctx: context,
				params,
				signal: controller.signal,
				logger,
			})

			// Persist the entire updated context back to Redis for the next job.
			const updatedContextObject = Object.fromEntries(context.entries())
			const serializedUpdatedContext = Object.entries(updatedContextObject).flatMap(([key, value]) => {
				if (typeof key === 'symbol')
					return [] // Symbols cannot be keys in Redis hashes
				return [key, JSON.stringify(value)]
			})

			if (serializedUpdatedContext.length > 0)
				await redisConnection.hset(contextKey, ...serializedUpdatedContext)

			if (action === FINAL_ACTION) {
				logger.info(`[Worker] Final node executed for Run ID ${runId}. Reporting 'completed' status...`)
				const finalPayload = context.get('__final_payload')
				const statusPayload = { status: 'completed', payload: finalPayload ?? null }
				await redisConnection.set(statusKey, JSON.stringify(statusPayload), 'EX', 3600)
				await redisConnection.del(contextKey) // Clean up context hash
				return
			}

			if (controller.signal.aborted)
				throw new AbortError('Job cancelled after execution, before enqueueing next step.')

			const successor = node.successors.get(action)
			if (!successor) {
				logger.info(`[Worker] Branch complete for run ${runId}. Node '${nodeId}' has no successor for action '${String(action)}'.`)
				return
			}

			const nodesToEnqueue = (successor instanceof Flow) ? (successor as any).nodesToRun : [successor]

			for (const nextNode of nodesToEnqueue) {
				const nextNodeId = nextNode.id!
				const predecessorCount = await masterRegistry.getPredecessorCount(workflowId, nextNodeId)

				if (predecessorCount <= 1) {
					logger.info(`[Worker] Enqueuing successor: ${nextNodeId} for run ${runId}.`)
					await queue.add(nextNodeId, { runId, workflowId, nodeId: nextNodeId, context: {}, params })
				}
				else {
					const joinKey = `workflow:join:${runId}:${nextNodeId}`
					const completedCount = await redisConnection.incr(joinKey)
					await redisConnection.expire(joinKey, 3600)

					logger.info(`[Worker] Predecessor ${nodeId} completed for fan-in node ${nextNodeId}. (${completedCount}/${predecessorCount})`)

					if (completedCount >= predecessorCount) {
						logger.info(`[Worker] All ${predecessorCount} predecessors for ${nextNodeId} have completed. Enqueuing join node.`)
						await queue.add(nextNodeId, { runId, workflowId, nodeId: nextNodeId, context: {}, params })
						await redisConnection.del(joinKey)
					}
				}
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

import type { AbstractNode, NodeArgs } from 'cascade'
import type { NodeJobPayload } from './executor'
import path from 'node:path'
import process from 'node:process'
import { Queue, Worker } from 'bullmq'
import { ConsoleLogger, Flow, TypedContext } from 'cascade'
import IORedis from 'ioredis'
import { WorkflowRegistry } from './registry'
import 'dotenv/config'

const QUEUE_NAME = 'distributed-cascade-queue'

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
	// A real app would have a more sophisticated way to route to the correct registry.
	// For this example, we'll just search all of them.
	async function getNodeFromRegistries(workflowId: number, nodeId: string): Promise<AbstractNode | undefined> {
		for (const registry of registries) {
			try {
				const node = await registry.getNode(workflowId, nodeId)
				if (node)
					return node
			}
			catch (e) { /* Node not in this registry, ignore */ }
		}
		return undefined
	}

	logger.info(`Worker listening on queue: "${QUEUE_NAME}"`)

	const worker = new Worker<NodeJobPayload>(QUEUE_NAME, async (job) => {
		const { workflowId, nodeId, context: serializedContext, params } = job.data
		logger.info(`[Worker] Processing job: ${job.name} (Workflow: ${workflowId}, Node: ${nodeId})`)

		// 1. Find the executable node instance from the registry.
		const node = await getNodeFromRegistries(workflowId, nodeId)
		if (!node) {
			logger.error(`Node not found: Could not find node '${nodeId}' in workflow '${workflowId}'. Terminating job.`)
			throw new Error('Node not found')
		}

		// 2. Rehydrate the context.
		const context = new TypedContext(Object.entries(serializedContext))

		// 3. Execute the node's logic.
		const nodeArgs: NodeArgs = {
			ctx: context,
			params,
			signal: undefined, // Cancellation is not supported in this simple worker.
			logger,
			prepRes: undefined,
			execRes: undefined,
			name: node.constructor.name,
		}
		const action = await node._run(context, params, undefined, logger)

		// 4. Determine the next node(s) to enqueue.
		const successor = node.successors.get(action)
		if (!successor) {
			logger.info(`[Worker] Branch complete for workflow ${workflowId}. Node '${nodeId}' returned action '${String(action)}' with no successor.`)
			return
		}

		// 5. Enqueue the successor(s).
		const updatedContext = Object.fromEntries(context.entries())

		const isParallel = successor instanceof Flow
		const nodesToEnqueue = isParallel
			? (successor as any).nodesToRun
			: [successor]

		logger.info(`[Worker] Enqueuing ${nodesToEnqueue.length} successor(s) for action '${String(action)}'.`)

		for (const nextNode of nodesToEnqueue) {
			const nextNodeId = nextNode.id!
			await queue.add(nextNodeId, {
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

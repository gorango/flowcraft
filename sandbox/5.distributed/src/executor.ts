import type { Job } from 'bullmq'
import type { Context, IExecutor, RunOptions } from 'flowcraft'
import type IORedis from 'ioredis'
import type { NodeJobPayload } from './types'
import { Queue } from 'bullmq'
import { Flow } from 'flowcraft'

export class BullMQExecutor implements IExecutor {
	public readonly queue: Queue<NodeJobPayload>

	constructor(
		queueName: string,
		private connection: IORedis,
	) {
		this.queue = new Queue(queueName, { connection })
	}

	async run(flow: Flow, context: Context, options?: RunOptions): Promise<any> {
		const logger = options?.logger
		const runId = options?.params?.runId as string
		const workflowId = options?.params?.workflowId as number

		if (!runId || !workflowId) {
			throw new Error('BullMQExecutor requires a `runId` and `workflowId` to be passed in `options.params`.')
		}
		if (!flow.startNode) {
			logger?.warn(`Executing a flow with no startNode: ${flow.constructor.name}. Nothing to do.`)
			return
		}

		const serializedContext = Object.fromEntries(context.entries())
		const combinedParams = { ...flow.params, ...options?.params }

		// The GraphBuilder creates a special Flow to handle parallel start nodes.
		// We need to look inside it to enqueue the actual start nodes.
		const isParallelStart = flow.startNode instanceof Flow
		const nodesToEnqueue = isParallelStart
			? (flow.startNode as any).nodesToRun
			: [flow.startNode]

		if (!nodesToEnqueue || nodesToEnqueue.length === 0) {
			logger?.warn('Flow start node has no executable children.')
			return
		}

		logger?.info(`[Executor] Enqueuing ${nodesToEnqueue.length} start node(s) for workflow ${workflowId}`)
		logger?.info(`[Executor] Starting Run ID: ${runId}`)

		const jobs: Job[] = []
		for (const node of nodesToEnqueue) {
			const nodeId = node.id!
			const jobPayload: NodeJobPayload = {
				runId,
				workflowId,
				nodeId,
				context: serializedContext,
				params: combinedParams,
			}
			const job = await this.queue.add(nodeId, jobPayload)
			jobs.push(job)
		}

		if (jobs.length === 0)
			return undefined
		if (jobs.length === 1)
			return jobs[0]
		return jobs
	}
}

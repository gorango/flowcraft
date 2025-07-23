import type { Context, IExecutor, RunOptions } from 'cascade'
import type IORedis from 'ioredis'
import type { WorkflowRegistry } from './registry'
import { Queue } from 'bullmq'
import { Flow } from 'cascade'

export interface NodeJobPayload {
	workflowId: number
	nodeId: string
	context: Record<string, any>
	params: Record<string, any>
}

export class BullMQExecutor implements IExecutor {
	public readonly queue: Queue<NodeJobPayload>

	constructor(
		queueName: string,
		private connection: IORedis,
		// The registry is not used by the client-side executor, but would be
		// essential for a more advanced implementation (e.g., synchronous awaits).
		private registry: WorkflowRegistry,
	) {
		this.queue = new Queue(queueName, { connection })
	}

	/**
	 * Starts a workflow by enqueuing its first node(s).
	 * This is a "fire-and-forget" operation from the client's perspective.
	 */
	async run(flow: Flow, context: Context, options?: RunOptions): Promise<any> {
		const logger = options?.logger
		const workflowId = options?.params?.workflowId as number
		if (!workflowId) {
			throw new Error('BullMQExecutor requires a workflowId to be passed in `options.params`.')
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

		logger?.info(`[Executor] Enqueuing ${nodesToEnqueue.length} start node(s) for workflow ${workflowId}.`)

		for (const node of nodesToEnqueue) {
			const nodeId = node.id!
			if (!nodeId) {
				logger?.error('Start node is missing an ID. Cannot enqueue.', { node })
				continue
			}
			const jobPayload: NodeJobPayload = {
				workflowId,
				nodeId,
				context: serializedContext,
				params: combinedParams,
			}
			// Use the node's ID as the job name for better monitoring.
			await this.queue.add(nodeId, jobPayload)
		}
	}
}

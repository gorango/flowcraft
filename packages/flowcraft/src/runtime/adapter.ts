import { JsonSerializer } from '../serializer'
import type { IAsyncContext, ISerializer, RuntimeOptions, WorkflowBlueprint, WorkflowResult } from '../types'
import { FlowRuntime } from './runtime'

/**
 * Defines the contract for an atomic, distributed key-value store required by
 * the adapter for coordination tasks like fan-in joins and locking.
 */
export interface ICoordinationStore {
	/** Atomically increments a key and returns the new value. Ideal for 'all' joins. */
	increment: (key: string, ttlSeconds: number) => Promise<number>
	/** Sets a key only if it does not already exist. Ideal for 'any' joins (locking). */
	setIfNotExist: (key: string, value: string, ttlSeconds: number) => Promise<boolean>
	/** Deletes a key. Used for cleanup. */
	delete: (key: string) => Promise<void>
}

/** Configuration options for constructing a BaseDistributedAdapter. */
export interface AdapterOptions {
	runtimeOptions: RuntimeOptions<any>
	coordinationStore: ICoordinationStore
}

/** The data payload expected for a job in the queue. */
export interface JobPayload {
	runId: string
	blueprintId: string
	nodeId: string
}

/**
 * The base class for all distributed adapters. It handles the technology-agnostic
 * orchestration logic and leaves queue-specific implementation to subclasses.
 */
export abstract class BaseDistributedAdapter {
	protected readonly runtime: FlowRuntime<any, any>
	protected readonly store: ICoordinationStore
	protected readonly serializer: ISerializer

	constructor(options: AdapterOptions) {
		this.runtime = new FlowRuntime(options.runtimeOptions)
		this.store = options.coordinationStore
		this.serializer = options.runtimeOptions.serializer || new JsonSerializer()
		console.log('[Adapter] BaseDistributedAdapter initialized.')
	}

	/**
	 * Starts the worker, which begins listening for and processing jobs from the queue.
	 */
	public start(): void {
		console.log('[Adapter] Starting worker...')
		this.processJobs(this.handleJob.bind(this))
	}

	/**
	 * Creates a technology-specific distributed context for a given workflow run.
	 * @param runId The unique ID for the workflow execution.
	 */
	protected abstract createContext(runId: string): IAsyncContext<Record<string, any>>
	/**
	 * Sets up the listener for the message queue. The implementation should call the
	 * provided `handler` function for each new job received.
	 * @param handler The core logic to execute for each job.
	 */
	protected abstract processJobs(handler: (job: JobPayload) => Promise<void>): void

	/**
	 * Enqueues a new job onto the message queue.
	 * @param job The payload for the job to be enqueued.
	 */
	protected abstract enqueueJob(job: JobPayload): Promise<void>

	/**
	 * Publishes the final result of a completed or failed workflow run.
	 * @param runId The unique ID of the workflow run.
	 * @param result The final status and payload of the workflow.
	 */
	protected abstract publishFinalResult(
		runId: string,
		result: {
			status: 'completed' | 'failed'
			payload?: WorkflowResult
			reason?: string
		},
	): Promise<void>

	/**
	 * The main handler for processing a single job from the queue.
	 */
	private async handleJob(job: JobPayload): Promise<void> {
		const { runId, blueprintId, nodeId } = job

		const blueprint = this.runtime.options.blueprints?.[blueprintId]
		if (!blueprint) {
			const reason = `Blueprint with ID '${blueprintId}' not found in the worker's runtime registry.`
			console.error(`[Adapter] FATAL: ${reason}`)
			await this.publishFinalResult(runId, { status: 'failed', reason })
			return
		}

		const context = this.createContext(runId)
		const workerState = {
			getContext: () => context,
			markFallbackExecuted: () => { },
			addError: (nodeId: string, error: Error) => {
				console.error(`[Adapter] Error in node ${nodeId}:`, error)
			},
		} as any

		try {
			const result = await this.runtime.executeNode(blueprint, nodeId, workerState)
			await context.set(nodeId as any, result.output)

			const nodeDef = blueprint.nodes.find((n) => n.id === nodeId)
			// workflow is considered complete when the first 'output' node finishes.
			if (nodeDef?.uses === 'output') {
				console.log(`[Adapter] ✅ Output node '${nodeId}' finished. Declaring workflow complete for Run ID: ${runId}`)
				const finalContext = await context.toJSON()
				const finalResult: WorkflowResult = {
					context: finalContext,
					serializedContext: this.serializer.serialize(finalContext),
					status: 'completed',
				}
				await this.publishFinalResult(runId, {
					status: 'completed',
					payload: finalResult,
				})
				return
			}

			const nextNodes = await this.runtime.determineNextNodes(blueprint, nodeId, result, context)

			// stop if a branch terminates but it wasn't an 'output' node
			if (nextNodes.length === 0) {
				console.log(
					`[Adapter] Terminal node '${nodeId}' reached for Run ID '${runId}', but it was not an 'output' node. This branch will now terminate.`,
				)
				return
			}

			for (const { node: nextNodeDef, edge } of nextNodes) {
				await this.runtime.applyEdgeTransform(edge, result, nextNodeDef, context)
				const isReady = await this.isReadyForFanIn(runId, blueprint, nextNodeDef.id)
				if (isReady) {
					console.log(`[Adapter] Node '${nextNodeDef.id}' is ready. Enqueuing job.`)
					await this.enqueueJob({ runId, blueprintId, nodeId: nextNodeDef.id })
				} else {
					console.log(`[Adapter] Node '${nextNodeDef.id}' is waiting for other predecessors to complete.`)
				}
			}
		} catch (error: any) {
			const reason = error.message || 'Unknown execution error'
			console.error(`[Adapter] FATAL: Job for node '${nodeId}' failed for Run ID '${runId}': ${reason}`)
			await this.publishFinalResult(runId, { status: 'failed', reason })
		}
	}

	/**
	 * Encapsulates the fan-in join logic using the coordination store.
	 */
	private async isReadyForFanIn(runId: string, blueprint: WorkflowBlueprint, targetNodeId: string): Promise<boolean> {
		const targetNode = blueprint.nodes.find((n) => n.id === targetNodeId)
		if (!targetNode) {
			throw new Error(`Node '${targetNodeId}' not found in blueprint`)
		}
		const joinStrategy = targetNode.config?.joinStrategy || 'all'
		const predecessors = blueprint.edges.filter((e) => e.target === targetNodeId)

		if (predecessors.length <= 1) {
			return true
		}

		if (joinStrategy === 'any') {
			const lockKey = `flowcraft:joinlock:${runId}:${targetNodeId}`
			return await this.store.setIfNotExist(lockKey, 'locked', 3600)
		} else {
			const fanInKey = `flowcraft:fanin:${runId}:${targetNodeId}`
			const readyCount = await this.store.increment(fanInKey, 3600)
			if (readyCount >= predecessors.length) {
				await this.store.delete(fanInKey)
				return true
			}
			return false
		}
	}
}

import { JsonSerializer } from '../serializer'
import type {
	IAsyncContext,
	ISerializer,
	NodeResult,
	RuntimeOptions,
	WorkflowBlueprint,
	WorkflowResult,
} from '../types'
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
	 * Hook called at the start of job processing. Subclasses can override this
	 * to perform additional setup (e.g., timestamp tracking for reconciliation).
	 */
	protected async onJobStart(_runId: string, _blueprintId: string, _nodeId: string): Promise<void> {
		// default implementation does nothing
	}

	/**
	 * The main handler for processing a single job from the queue.
	 */
	protected async handleJob(job: JobPayload): Promise<void> {
		const { runId, blueprintId, nodeId } = job

		await this.onJobStart(runId, blueprintId, nodeId)

		const blueprint = this.runtime.options.blueprints?.[blueprintId]
		if (!blueprint) {
			const reason = `Blueprint with ID '${blueprintId}' not found in the worker's runtime registry.`
			console.error(`[Adapter] FATAL: ${reason}`)
			await this.publishFinalResult(runId, { status: 'failed', reason })
			return
		}

		const context = this.createContext(runId)

		// persist the blueprintId for the reconcile method to find later
		const hasBlueprintId = await context.has('blueprintId' as any)
		if (!hasBlueprintId) {
			await context.set('blueprintId' as any, blueprintId)
		}
		const workerState = {
			getContext: () => context,
			markFallbackExecuted: () => {},
			addError: (nodeId: string, error: Error) => {
				console.error(`[Adapter] Error in node ${nodeId}:`, error)
			},
		} as any

		try {
			const result: NodeResult<any, any> = await this.runtime.executeNode(blueprint, nodeId, workerState)
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
	protected async isReadyForFanIn(runId: string, blueprint: WorkflowBlueprint, targetNodeId: string): Promise<boolean> {
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

	/**
	 * Reconciles the state of a workflow run. It inspects the persisted
	 * context to find completed nodes, determines the next set of executable
	 * nodes (the frontier), and enqueues jobs for them if they aren't
	 * already running. This is the core of the resume functionality.
	 *
	 * @param runId The unique ID of the workflow execution to reconcile.
	 * @returns The set of node IDs that were enqueued for execution.
	 */
	public async reconcile(runId: string): Promise<Set<string>> {
		const context = this.createContext(runId)
		const blueprintId = (await context.get('blueprintId' as any)) as string | undefined

		if (!blueprintId) {
			throw new Error(`Cannot reconcile runId '${runId}': blueprintId not found in context.`)
		}
		const blueprint = this.runtime.options.blueprints?.[blueprintId]
		if (!blueprint) {
			throw new Error(`Cannot reconcile runId '${runId}': Blueprint with ID '${blueprintId}' not found.`)
		}

		const state = await context.toJSON()
		// filter out internal keys
		const completedNodes = new Set(Object.keys(state).filter((k) => blueprint.nodes.some((n) => n.id === k)))

		const frontier = this.calculateResumedFrontier(blueprint, completedNodes)

		const enqueuedNodes = new Set<string>()
		for (const nodeId of frontier) {
			const nodeDef = blueprint.nodes.find((n) => n.id === nodeId)
			const joinStrategy = nodeDef?.config?.joinStrategy || 'all'

			let shouldEnqueue = false

			if (joinStrategy === 'any') {
				// acquire the permanent join lock
				const lockKey = `flowcraft:joinlock:${runId}:${nodeId}`
				if (await this.store.setIfNotExist(lockKey, 'locked-by-reconcile', 3600)) {
					shouldEnqueue = true
				} else {
					console.log(`[Adapter] Reconciling: Node '${nodeId}' is an 'any' join and is already locked.`, { runId })
				}
			} else {
				// 'all' joins and single-predecessor nodes use a temporary lock
				const lockKey = `flowcraft:nodelock:${runId}:${nodeId}`
				if (await this.store.setIfNotExist(lockKey, 'locked', 120)) {
					shouldEnqueue = true
				} else {
					console.log(`[Adapter] Reconciling: Node '${nodeId}' is already locked.`, { runId })
				}
			}

			if (shouldEnqueue) {
				console.log(`[Adapter] Reconciling: Enqueuing ready job for node '${nodeId}'`, { runId })
				await this.enqueueJob({ runId, blueprintId: blueprint.id, nodeId })
				enqueuedNodes.add(nodeId)
			}
		}

		return enqueuedNodes
	}

	private calculateResumedFrontier(blueprint: WorkflowBlueprint, completedNodes: Set<string>): Set<string> {
		const newFrontier = new Set<string>()
		const allPredecessors = new Map<string, Set<string>>()
		// (logic extracted from the GraphTraverser)
		for (const node of blueprint.nodes) {
			allPredecessors.set(node.id, new Set())
		}
		for (const edge of blueprint.edges) {
			allPredecessors.get(edge.target)?.add(edge.source)
		}

		for (const node of blueprint.nodes) {
			if (completedNodes.has(node.id)) {
				continue
			}

			const predecessors = allPredecessors.get(node.id) ?? new Set()
			if (predecessors.size === 0 && !completedNodes.has(node.id)) {
				newFrontier.add(node.id)
				continue
			}

			const joinStrategy = node.config?.joinStrategy || 'all'
			const completedPredecessors = [...predecessors].filter((p) => completedNodes.has(p))

			const isReady =
				joinStrategy === 'any' ? completedPredecessors.length > 0 : completedPredecessors.length === predecessors.size

			if (isReady) {
				newFrontier.add(node.id)
			}
		}
		return newFrontier
	}
}

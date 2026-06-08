import { analyzeBlueprint } from '../analysis'
import { TrackedAsyncContext } from '../context'
import { ConsoleLogger } from '../logger'
import { JsonSerializer } from '../serializer'
import type {
	IAsyncContext,
	IEventBus,
	ILogger,
	ISerializer,
	NodeDefinition,
	NodeResult,
	RuntimeOptions,
	WorkflowBlueprint,
	WorkflowResult,
} from '../types'
import { FlowRuntime } from './runtime'
import { WorkflowState } from './state'

/**
 * Defines the contract for an atomic, distributed key-value store required by
 * the adapter for coordination tasks like fan-in joins and locking.
 */
export interface ICoordinationStore {
	/** Atomically increments a key and returns the new value. Ideal for 'all' joins. */
	increment: (key: string, ttlSeconds: number) => Promise<number>
	/** Sets a key only if it does not already exist. Ideal for 'any' joins (locking). */
	setIfNotExist: (key: string, value: string, ttlSeconds: number) => Promise<boolean>
	/** Extends the TTL of an existing key. Used for heartbeat mechanism in long-running jobs. */
	extendTTL: (key: string, ttlSeconds: number) => Promise<boolean>
	/** Deletes a key. Used for cleanup. */
	delete: (key: string) => Promise<void>
	/** Gets the value of a key. */
	get: (key: string) => Promise<string | undefined>
}

/** Configuration options for constructing a BaseDistributedAdapter. */
export interface AdapterOptions {
	runtimeOptions: RuntimeOptions<any>
	coordinationStore: ICoordinationStore
	eventBus?: IEventBus
}

/** The data payload expected for a job in the queue. */
export interface JobPayload {
	runId: string
	blueprintId: string
	nodeId: string
	/** Used to suppress intermediate failures and fallback triggers when delegating to Queue retries */
	isLastAttempt?: boolean
	/** Optional attempt tracking metadata */
	attempt?: number
}

/**
 * The base class for all distributed adapters. It handles the technology-agnostic
 * orchestration logic and leaves queue-specific implementation to subclasses.
 */
export abstract class BaseDistributedAdapter {
	protected readonly runtime: FlowRuntime<any, any>
	protected readonly store: ICoordinationStore
	protected readonly serializer: ISerializer
	protected readonly logger: ILogger
	protected readonly eventBus?: IEventBus

	constructor(options: AdapterOptions) {
		const runtimeOptions = {
			...options.runtimeOptions,
			dependencies: {
				...options.runtimeOptions.dependencies,
				adapter: this,
			} as any,
		}
		this.runtime = new FlowRuntime(runtimeOptions)
		this.store = options.coordinationStore
		this.serializer = options.runtimeOptions.serializer || new JsonSerializer()
		this.logger = options.runtimeOptions.logger || new ConsoleLogger()
		this.eventBus = options.eventBus
		this.logger.info('[Adapter] BaseDistributedAdapter initialized.')
	}

	/**
	 * Starts the worker, which begins listening for and processing jobs from the queue.
	 */
	public start(): void {
		this.logger.info('[Adapter] Starting worker...')
		this.processJobs(this.handleJob.bind(this))
	}

	/**
	 * Hook called by the execution factory to determine if a node's automatic
	 * retries should be executed synchronously in-process (true) or delegated
	 * to the Queue backoff behavior configured by the adapter (false).
	 */
	protected shouldRetryInProcess(_nodeDef: NodeDefinition): boolean {
		return true // Default backward compatible behavior
	}

	/**
	 * Returns queue-level retry options for enqueuing successor jobs.
	 * Only used when shouldRetryInProcess() returns false.
	 */
	protected getQueueRetryOptions(_nodeDef: NodeDefinition): Record<string, any> | undefined {
		return undefined
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
	 * Registers a webhook endpoint for a specific node in a workflow run.
	 * @param runId The unique ID of the workflow run.
	 * @param nodeId The ID of the node that will wait for the webhook.
	 * @returns The URL and event name for the webhook.
	 */
	public abstract registerWebhookEndpoint(
		runId: string,
		nodeId: string,
	): Promise<{ url: string; event: string }>

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
		const startTime = Date.now()

		await this.onJobStart(runId, blueprintId, nodeId)

		const blueprint = this.runtime.options.blueprints?.[blueprintId]
		if (!blueprint) {
			const reason = `Blueprint with ID '${blueprintId}' not found in the worker's runtime registry.`
			this.logger.error(`[Adapter] FATAL: ${reason}`)
			await this.publishFinalResult(runId, { status: 'failed', reason })
			return
		}

		const context = this.createContext(runId)

		const storedVersion = await context.get('blueprintVersion' as any)
		const currentVersion = blueprint.metadata?.version || null
		if (storedVersion !== currentVersion) {
			const reason = `Blueprint version mismatch: stored version '${storedVersion}', current version '${currentVersion}'. Rejecting job to prevent state corruption.`
			this.logger.warn(`[Adapter] Version mismatch for run ${runId}, node ${nodeId}: ${reason}`)
			return
		}

		// persist the blueprintId and version for the reconcile method to find later
		const hasBlueprintId = await context.has('blueprintId' as any)
		if (!hasBlueprintId) {
			await context.set('blueprintId' as any, blueprintId)
			await context.set('blueprintVersion' as any, blueprint.metadata?.version || null)
			// also store in coordination store as fallback
			const blueprintKey = `flowcraft:blueprint:${runId}`
			await this.store.setIfNotExist(blueprintKey, blueprintId, 3600)
		}

		// heartbeat to extend TTLs of coordination keys for long-running jobs
		const joinLockKey = `flowcraft:joinlock:${runId}:${nodeId}`
		const fanInKey = `flowcraft:fanin:${runId}:${nodeId}`
		const blueprintKey = `flowcraft:blueprint:${runId}`
		const heartbeatInterval = setInterval(async () => {
			await this.store.extendTTL(joinLockKey, 3600)
			await this.store.extendTTL(fanInKey, 3600)
			await this.store.extendTTL(blueprintKey, 3600)
			this.logger.debug(`[Adapter] Extended TTLs for run ${runId}, node ${nodeId}`)
		}, 1800000) // 30 minutes

		try {
			const contextData = await context.toJSON()
			const state = new WorkflowState(contextData, context)
			state.isLastAttempt = job.isLastAttempt !== false

			let result: NodeResult<any, any>

			const alreadyCompleted = await context.has(`_outputs.${nodeId}` as any)

			if (alreadyCompleted) {
				this.logger.info(`[Adapter] Node '${nodeId}' already completed, skipping re-execution.`)
				result = { output: await context.get(`_outputs.${nodeId}` as any) }
			} else {
				const nodeDef = blueprint.nodes.find((n) => n.id === nodeId)
				if (nodeDef && !this.shouldRetryInProcess(nodeDef)) {
					if (nodeDef.config?.maxRetries && nodeDef.config.maxRetries > 1) {
						nodeDef.config.maxRetries = 1
					}
				}

				result = await this.runtime.executeNode(blueprint, nodeId, state)
				await context.set(`_outputs.${nodeId}` as any, result.output)

				const stateContext = state.getContext()
				if (stateContext instanceof TrackedAsyncContext) {
					const deltas = stateContext.getDeltas()
					if (deltas.length > 0) {
						await stateContext.patch(deltas)
						stateContext.clearDeltas()
					}
				}
			}

			await this.handleNodeCompletion({
				runId,
				blueprintId,
				nodeId,
				blueprint,
				result,
				context,
				startTime,
				heartbeatInterval,
			})
		} catch (error: any) {
			const reason = error.message || 'Unknown execution error'
			this.logger.error(
				`[Adapter] FATAL: Job for node '${nodeId}' failed for Run ID '${runId}': ${reason}`,
			)

			if (this.eventBus) {
				await this.eventBus.emit({
					type: 'job:failed',
					payload: { runId, blueprintId, nodeId, error },
				})
			}

			if (job.isLastAttempt === false) {
				this.logger.warn(
					`[Adapter] Job for node '${nodeId}' failed (queue attempt ${job.attempt || 1}), delegating retry to queue.`,
				)
				return
			}

			await this.publishFinalResult(runId, { status: 'failed', reason })
			await this.writePoisonPillForSuccessors(runId, blueprint, nodeId)
		} finally {
			clearInterval(heartbeatInterval)
		}
	}

	/**
	 * Handles post-execution logic: terminal node checks, successor determination,
	 * and enqueueing of ready nodes. Extracted to support the idempotency guard.
	 */
	private async handleNodeCompletion(params: {
		runId: string
		blueprintId: string
		nodeId: string
		blueprint: WorkflowBlueprint
		result: NodeResult<any, any>
		context: IAsyncContext<Record<string, any>>
		startTime: number
		heartbeatInterval: ReturnType<typeof setInterval>
	}): Promise<void> {
		const { runId, blueprintId, nodeId, blueprint, result, context, startTime, heartbeatInterval } =
			params

		const analysis = analyzeBlueprint(blueprint)
		const isTerminalNode = analysis.terminalNodeIds.includes(nodeId)

		if (isTerminalNode) {
			const allContextKeys = Object.keys(await context.toJSON())
			const completedNodes = new Set<string>()
			for (const key of allContextKeys) {
				if (key.startsWith('_outputs.')) {
					completedNodes.add(key.substring('_outputs.'.length))
				}
			}
			const allTerminalNodesCompleted = analysis.terminalNodeIds.every((terminalId) =>
				completedNodes.has(terminalId),
			)

			if (allTerminalNodesCompleted) {
				this.logger.info(
					`[Adapter] All terminal nodes completed for Run ID: ${runId}. Declaring workflow complete.`,
				)
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
				clearInterval(heartbeatInterval)
				return
			} else {
				this.logger.info(
					`[Adapter] Terminal node '${nodeId}' completed for Run ID '${runId}', but other terminal nodes are still running.`,
				)
			}
		}

		const nextNodes = await this.runtime.determineNextNodes(
			blueprint,
			nodeId,
			result,
			context,
			runId,
		)

		// stop if a branch terminates but it wasn't a terminal node
		if (nextNodes.length === 0 && !isTerminalNode) {
			this.logger.info(
				`[Adapter] Non-terminal node '${nodeId}' reached end of branch for Run ID '${runId}'. This branch will now terminate.`,
			)
			clearInterval(heartbeatInterval)
			return
		}

		for (const { node: nextNodeDef, edge } of nextNodes) {
			await this.runtime.applyEdgeTransform(edge, result, nextNodeDef, context, undefined, runId)
			const isReady = await this.isReadyForFanIn(runId, blueprint, nextNodeDef.id)
			if (isReady) {
				this.logger.info(`[Adapter] Node '${nextNodeDef.id}' is ready. Enqueuing job.`)
				await this.enqueueJob({ runId, blueprintId, nodeId: nextNodeDef.id })
				if (this.eventBus) {
					await this.eventBus.emit({
						type: 'job:enqueued',
						payload: { runId, blueprintId, nodeId: nextNodeDef.id },
					})
				}
			} else {
				this.logger.info(
					`[Adapter] Node '${nextNodeDef.id}' is waiting for other predecessors to complete.`,
				)
			}
		}

		const duration = Date.now() - startTime
		if (this.eventBus) {
			await this.eventBus.emit({
				type: 'job:processed',
				payload: { runId, blueprintId, nodeId, duration, success: true },
			})
		}
	}

	/**
	 * Encapsulates the fan-in join logic using the coordination store.
	 */
	protected async isReadyForFanIn(
		runId: string,
		blueprint: WorkflowBlueprint,
		targetNodeId: string,
	): Promise<boolean> {
		const targetNode = blueprint.nodes.find((n) => n.id === targetNodeId)
		if (!targetNode) {
			throw new Error(`Node '${targetNodeId}' not found in blueprint`)
		}
		const joinStrategy = targetNode.config?.joinStrategy || 'all'
		const predecessors = blueprint.edges.filter((e) => e.target === targetNodeId)

		if (predecessors.length <= 1) {
			return true
		}

		const poisonKey = `flowcraft:fanin:poison:${runId}:${targetNodeId}`
		const isPoisoned = await this.store.get(poisonKey)
		if (isPoisoned) {
			this.logger.info(
				`[Adapter] Node '${targetNodeId}' is poisoned due to failed predecessor. Failing immediately.`,
			)
			throw new Error(`Node '${targetNodeId}' failed due to poisoned predecessor in run '${runId}'`)
		}

		if (joinStrategy === 'any') {
			const lockKey = `flowcraft:joinlock:${runId}:${targetNodeId}`
			const isLocked = await this.store.setIfNotExist(lockKey, 'locked', 3600)
			if (!isLocked) {
				// check if cancelled
				const cancelKey = `flowcraft:fanin:cancel:${runId}:${targetNodeId}`
				const isCancelled = !(await this.store.setIfNotExist(cancelKey, 'cancelled', 3600))
				if (isCancelled) {
					this.logger.info(
						`[Adapter] Node '${targetNodeId}' is cancelled due to failed predecessor. Failing immediately.`,
					)
					throw new Error(
						`Node '${targetNodeId}' failed due to cancelled predecessor in run '${runId}'`,
					)
				}
				return false // already locked by another predecessor
			}
			return true
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
		let blueprintId = (await context.get('blueprintId' as any)) as string | undefined

		if (!blueprintId) {
			// fallback to coordination store
			const blueprintKey = `flowcraft:blueprint:${runId}`
			blueprintId = await this.store.get(blueprintKey)
			if (blueprintId) {
				// set it back in context for future use
				await context.set('blueprintId' as any, blueprintId)
			} else {
				throw new Error(
					`Cannot reconcile runId '${runId}': blueprintId not found in context or coordination store.`,
				)
			}
		}
		const blueprint = this.runtime.options.blueprints?.[blueprintId]
		if (blueprint && !(await context.has('blueprintVersion' as any))) {
			await context.set('blueprintVersion' as any, blueprint.metadata?.version || null)
		}
		if (!blueprint) {
			throw new Error(
				`Cannot reconcile runId '${runId}': Blueprint with ID '${blueprintId}' not found.`,
			)
		}

		const state = await context.toJSON()
		const completedNodes = new Set<string>()
		for (const key of Object.keys(state)) {
			if (key.startsWith('_outputs.')) {
				completedNodes.add(key.substring('_outputs.'.length))
			}
		}

		const frontier = this.calculateResumedFrontier(blueprint, completedNodes)

		const enqueuedNodes = new Set<string>()
		for (const nodeId of frontier) {
			const nodeDef = blueprint.nodes.find((n) => n.id === nodeId)
			const joinStrategy = nodeDef?.config?.joinStrategy || 'all'

			const poisonKey = `flowcraft:fanin:poison:${runId}:${nodeId}`
			const isPoisoned = await this.store.get(poisonKey)
			if (isPoisoned) {
				this.logger.info(`[Adapter] Reconciling: Node '${nodeId}' is poisoned, skipping.`, {
					runId,
				})
				continue
			}

			let shouldEnqueue = false

			if (joinStrategy === 'any') {
				// acquire the permanent join lock
				const lockKey = `flowcraft:joinlock:${runId}:${nodeId}`
				if (await this.store.setIfNotExist(lockKey, 'locked-by-reconcile', 3600)) {
					shouldEnqueue = true
				} else {
					this.logger.info(
						`[Adapter] Reconciling: Node '${nodeId}' is an 'any' join and is already locked.`,
						{ runId },
					)
				}
			} else {
				// 'all' joins and single-predecessor nodes use a temporary lock
				const lockKey = `flowcraft:nodelock:${runId}:${nodeId}`
				if (await this.store.setIfNotExist(lockKey, 'locked', 120)) {
					shouldEnqueue = true
				} else {
					this.logger.info(`[Adapter] Reconciling: Node '${nodeId}' is already locked.`, {
						runId,
					})
				}
			}

			if (shouldEnqueue) {
				this.logger.info(`[Adapter] Reconciling: Enqueuing ready job for node '${nodeId}'`, {
					runId,
				})
				await this.enqueueJob({ runId, blueprintId: blueprint.id, nodeId })
				enqueuedNodes.add(nodeId)
			}
		}

		return enqueuedNodes
	}

	/**
	 * Resumes an awaiting workflow run by injecting user-provided action/output
	 * data into the context, clearing the awaiting state, and reconciling the
	 * execution frontier.
	 *
	 * This is the core of the Human-in-the-Loop (HITL) resume pattern. The
	 * injected resume data is stored under `_resume.action` and `_resume.output`
	 * keys in the context, where awaiting nodes (e.g., `waitNode`) can read
	 * them and return with the appropriate action to drive edge routing.
	 *
	 * @param runId The unique ID of the workflow execution to resume.
	 * @param action The user action (e.g., 'approve', 'reject').
	 * @param output Optional user-provided output data.
	 * @returns The set of node IDs that were enqueued for execution.
	 */
	public async resumeWithAction(
		runId: string,
		action: string,
		output?: unknown,
	): Promise<Set<string>> {
		const context = this.createContext(runId)

		const awaitingNodeIds = (await context.get('_awaitingNodeIds' as any)) as string[] | undefined

		await context.set('_resume.action' as any, action)
		if (output !== undefined) {
			await context.set('_resume.output' as any, output)
		}

		// mark awaiting nodes as completed so reconcile enqueues their successors
		if (awaitingNodeIds && awaitingNodeIds.length > 0) {
			for (const nodeId of awaitingNodeIds) {
				await context.set(`_outputs.${nodeId}` as any, output)
			}
		}

		await context.delete('_awaitingNodeIds' as any)
		await context.delete('_awaitingDetails' as any)

		this.logger.info(`[Adapter] Resuming run '${runId}' with action '${action}'`)

		return this.reconcile(runId)
	}

	private calculateResumedFrontier(
		blueprint: WorkflowBlueprint,
		completedNodes: Set<string>,
	): Set<string> {
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
				joinStrategy === 'any'
					? completedPredecessors.length > 0
					: completedPredecessors.length === predecessors.size

			if (isReady) {
				newFrontier.add(node.id)
			}
		}
		return newFrontier
	}

	/**
	 * Writes a poison pill for 'all' join successors and a cancellation pill for 'any' join successors of a failed node to prevent stalling or ambiguous states.
	 */
	private async writePoisonPillForSuccessors(
		runId: string,
		blueprint: WorkflowBlueprint,
		failedNodeId: string,
	): Promise<void> {
		const successors = blueprint.edges
			.filter((edge) => edge.source === failedNodeId)
			.map((edge) => edge.target)
			.map((targetId) => blueprint.nodes.find((node) => node.id === targetId))
			.filter((node) => node)

		for (const successor of successors) {
			if (successor) {
				const joinStrategy = successor.config?.joinStrategy || 'all'
				if (joinStrategy === 'all') {
					const poisonKey = `flowcraft:fanin:poison:${runId}:${successor.id}`
					await this.store.setIfNotExist(poisonKey, 'poisoned', 3600)
					this.logger.info(
						`[Adapter] Wrote poison pill for 'all' join node '${successor.id}' due to failed predecessor '${failedNodeId}'`,
					)
				} else if (joinStrategy === 'any') {
					const cancelKey = `flowcraft:fanin:cancel:${runId}:${successor.id}`
					await this.store.setIfNotExist(cancelKey, 'cancelled', 3600)
					this.logger.info(
						`[Adapter] Wrote cancellation pill for 'any' join node '${successor.id}' due to failed predecessor '${failedNodeId}'`,
					)
				}
			}
		}
	}
}

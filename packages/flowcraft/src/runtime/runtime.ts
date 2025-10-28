import type { BlueprintAnalysis } from '../analysis'
import { analyzeBlueprint } from '../analysis'
import { DIContainer, ServiceTokens } from '../container'
import { FlowcraftError } from '../errors'
import { PropertyEvaluator } from '../evaluator'
import { NullLogger } from '../logger'
import { BatchGatherNode } from '../nodes/batch-gather'
import { BatchScatterNode } from '../nodes/batch-scatter'
import { SleepNode } from '../nodes/sleep'
import { SubflowNode } from '../nodes/subflow'
import { WaitNode } from '../nodes/wait'
import { sanitizeBlueprint } from '../sanitizer'
import { JsonSerializer } from '../serializer'
import type {
	ContextImplementation,
	EdgeDefinition,
	IEvaluator,
	IEventBus,
	ILogger,
	ISerializer,
	Middleware,
	NodeClass,
	NodeDefinition,
	NodeFunction,
	NodeResult,
	RuntimeOptions,
	WorkflowBlueprint,
	WorkflowError,
	WorkflowResult,
} from '../types'
import { ExecutionContext } from './execution-context'
import { NodeExecutorFactory } from './node-executor-factory'
import { DefaultOrchestrator } from './orchestrator'
import { WorkflowScheduler } from './scheduler'
import { WorkflowState } from './state'
import { GraphTraverser } from './traverser'
import type { IOrchestrator, IRuntime } from './types'
import { WorkflowLogicHandler } from './workflow-logic-handler'

export class FlowRuntime<TContext extends Record<string, any>, TDependencies extends Record<string, any>>
	implements IRuntime<TContext, TDependencies>
{
	private container: DIContainer
	public registry: Map<string, NodeFunction | NodeClass>
	private blueprints: Record<string, WorkflowBlueprint>
	public dependencies: TDependencies
	public logger: ILogger
	public eventBus: IEventBus
	public serializer: ISerializer
	public middleware: Middleware[]
	public evaluator: IEvaluator
	private analysisCache: WeakMap<WorkflowBlueprint, BlueprintAnalysis>
	public orchestrator: IOrchestrator
	public options: RuntimeOptions<TDependencies>
	private readonly logicHandler: WorkflowLogicHandler
	private readonly executorFactory: NodeExecutorFactory
	public scheduler: WorkflowScheduler

	getBlueprint(id: string): WorkflowBlueprint | undefined {
		return this.blueprints[id]
	}

	constructor(container: DIContainer, options?: RuntimeOptions<TDependencies>)
	constructor(options: RuntimeOptions<TDependencies>)
	constructor(
		containerOrOptions: DIContainer | RuntimeOptions<TDependencies>,
		legacyOptions?: RuntimeOptions<TDependencies>,
	) {
		if (containerOrOptions instanceof DIContainer) {
			this.container = containerOrOptions
			this.logger = this.container.resolve<ILogger>(ServiceTokens.Logger)
			this.serializer = this.container.resolve<ISerializer>(ServiceTokens.Serializer)
			this.evaluator = this.container.resolve<IEvaluator>(ServiceTokens.Evaluator)
			this.eventBus = this.container.resolve<IEventBus>(ServiceTokens.EventBus) || { emit: async () => {} }
			this.middleware = this.container.resolve<Middleware[]>(ServiceTokens.Middleware) || []
			this.registry = this.container.resolve<Map<string, NodeFunction | NodeClass>>(ServiceTokens.NodeRegistry)
			this.blueprints = this.container.resolve<Record<string, WorkflowBlueprint>>(ServiceTokens.BlueprintRegistry)
			this.dependencies = this.container.resolve<TDependencies>(ServiceTokens.Dependencies)
			this.options = legacyOptions || ({} as RuntimeOptions<TDependencies>)
			this.orchestrator = this.container.resolve<IOrchestrator>(ServiceTokens.Orchestrator)
			this.scheduler = new WorkflowScheduler(this)
		} else {
			const options = containerOrOptions
			this.logger = options.logger || new NullLogger()
			this.serializer = options.serializer || new JsonSerializer()
			this.evaluator = options.evaluator || new PropertyEvaluator()
			this.eventBus = options.eventBus || { emit: async () => {} }
			this.middleware = options.middleware || []
			const loopControllerFunction: NodeFunction = async (context) => {
				const condition = context.params.condition
				const contextData = await context.context.toJSON()
				const result = this.evaluator.evaluate(condition, contextData)
				if (result) {
					return { action: 'continue' }
				} else {
					return { action: 'break', output: null }
				}
			}
			const builtInNodes = {
				wait: WaitNode,
				sleep: SleepNode,
				subflow: SubflowNode,
				'batch-scatter': BatchScatterNode,
				'batch-gather': BatchGatherNode,
				'loop-controller': loopControllerFunction,
			}
			this.registry = new Map(Object.entries({ ...builtInNodes, ...(options.registry || {}) }))
			this.blueprints = options.blueprints || {}
			this.scheduler = new WorkflowScheduler(this)
			this.dependencies = options.dependencies || ({} as TDependencies)
			this.options = options
			this.container = null as any
		}
		this.orchestrator = this.container?.has(ServiceTokens.Orchestrator)
			? this.container.resolve<IOrchestrator>(ServiceTokens.Orchestrator)
			: new DefaultOrchestrator()
		this.analysisCache = new WeakMap()
		this.logicHandler = new WorkflowLogicHandler(this.evaluator, this.eventBus)
		this.executorFactory = new NodeExecutorFactory(this.eventBus)
	}

	private _setupExecutionContext(
		blueprint: WorkflowBlueprint,
		initialState: Partial<TContext> | string,
		options?: {
			functionRegistry?: Map<string, any>
			strict?: boolean
			signal?: AbortSignal
			concurrency?: number
		},
	): ExecutionContext<TContext, TDependencies> {
		const executionId = globalThis.crypto?.randomUUID()
		const contextData =
			typeof initialState === 'string' ? (this.serializer.deserialize(initialState) as Partial<TContext>) : initialState
		blueprint = sanitizeBlueprint(blueprint)
		const state = new WorkflowState<TContext>(contextData)
		const nodeRegistry = this._createExecutionRegistry(options?.functionRegistry)
		return new ExecutionContext(
			blueprint,
			state,
			nodeRegistry,
			executionId,
			this,
			{
				logger: this.logger,
				eventBus: this.eventBus,
				serializer: this.serializer,
				evaluator: this.evaluator,
				middleware: this.middleware,
				dependencies: this.dependencies,
			},
			options?.signal,
			options?.concurrency,
		)
	}

	async run(
		blueprint: WorkflowBlueprint,
		initialState: Partial<TContext> | string = {},
		options?: {
			functionRegistry?: Map<string, any>
			strict?: boolean
			signal?: AbortSignal
			concurrency?: number
		},
	): Promise<WorkflowResult<TContext>> {
		const startTime = Date.now()
		const executionContext = this._setupExecutionContext(blueprint, initialState, options)

		this.logger.info(`Starting workflow execution`, {
			blueprintId: executionContext.blueprint.id,
			executionId: executionContext.executionId,
		})

		try {
			await this.eventBus.emit({
				type: 'workflow:start',
				payload: { blueprintId: executionContext.blueprint.id, executionId: executionContext.executionId },
			})
			await this.eventBus.emit({
				type: 'workflow:resume',
				payload: { blueprintId: executionContext.blueprint.id, executionId: executionContext.executionId },
			})
			const analysis =
				this.analysisCache.get(executionContext.blueprint) ??
				(() => {
					const computed = analyzeBlueprint(executionContext.blueprint)
					this.analysisCache.set(executionContext.blueprint, computed)
					return computed
				})()
			if (options?.strict && !analysis.isDag) {
				throw new Error(`Workflow '${executionContext.blueprint.id}' failed strictness check: Cycles are not allowed.`)
			}
			if (!analysis.isDag) {
				this.logger.warn(`Workflow contains cycles`, {
					blueprintId: executionContext.blueprint.id,
				})
			}

			const traverser = new GraphTraverser(executionContext.blueprint, options?.strict === true)
			const result = await this.orchestrator.run(executionContext, traverser)

			const duration = Date.now() - startTime
			if (result.status === 'stalled') {
				await this.eventBus.emit({
					type: 'workflow:stall',
					payload: {
						blueprintId: executionContext.blueprint.id,
						executionId: executionContext.executionId,
						remainingNodes: traverser.getAllNodeIds().size - executionContext.state.getCompletedNodes().size,
					},
				})
				await this.eventBus.emit({
					type: 'workflow:pause',
					payload: { blueprintId: executionContext.blueprint.id, executionId: executionContext.executionId },
				})
			}
			this.logger.info(`Workflow execution completed`, {
				blueprintId: executionContext.blueprint.id,
				executionId: executionContext.executionId,
				status: result.status,
				duration,
				errors: result.errors?.length || 0,
			})
			await this.eventBus.emit({
				type: 'workflow:finish',
				payload: {
					blueprintId: executionContext.blueprint.id,
					executionId: executionContext.executionId,
					status: result.status,
					errors: result.errors,
				},
			})

			if (result.status === 'awaiting') {
				const awaitingNodeIds = executionContext.state.getAwaitingNodeIds()
				for (const nodeId of awaitingNodeIds) {
					const details = executionContext.state.getAwaitingDetails(nodeId)
					if (details?.reason === 'timer') {
						this.scheduler.registerAwaitingWorkflow(
							executionContext.executionId,
							executionContext.blueprint.id,
							result.serializedContext,
							nodeId,
							details.wakeUpAt,
						)
					}
				}
			}

			return result
		} catch (error) {
			const duration = Date.now() - startTime
			const workflowError: WorkflowError = {
				message: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString(),
				isFatal: false,
				name: 'WorkflowError',
			}
			await this.eventBus.emit({
				type: 'workflow:finish',
				payload: {
					blueprintId: executionContext.blueprint.id,
					executionId: executionContext.executionId,
					status: 'cancelled',
					errors: [workflowError],
				},
			})
			if (
				error instanceof DOMException
					? error.name === 'AbortError'
					: error instanceof FlowcraftError && error.message.includes('cancelled')
			) {
				this.logger.info(`Workflow execution cancelled`, {
					blueprintId: executionContext.blueprint.id,
					executionId: executionContext.executionId,
					duration,
				})
				await this.eventBus.emit({
					type: 'workflow:pause',
					payload: { blueprintId: executionContext.blueprint.id, executionId: executionContext.executionId },
				})
				await this.eventBus.emit({
					type: 'workflow:finish',
					payload: {
						blueprintId: executionContext.blueprint.id,
						executionId: executionContext.executionId,
						status: 'cancelled',
						errors: [workflowError],
					},
				})
				return {
					context: {} as TContext,
					serializedContext: '{}',
					status: 'cancelled',
				}
			}
			this.logger.error(`Workflow execution failed`, {
				blueprintId: executionContext.blueprint.id,
				executionId: executionContext.executionId,
				duration,
				error: error instanceof Error ? error.message : String(error),
			})
			throw error
		}
	}

	startScheduler(): void {
		this.scheduler.start()
	}

	stopScheduler(): void {
		this.scheduler.stop()
	}

	private _setupResumedExecutionContext(
		blueprint: WorkflowBlueprint,
		workflowState: WorkflowState<TContext>,
		options?: {
			functionRegistry?: Map<string, any>
			strict?: boolean
			signal?: AbortSignal
			concurrency?: number
		},
	): ExecutionContext<TContext, TDependencies> {
		const executionId = globalThis.crypto?.randomUUID()
		const nodeRegistry = this._createExecutionRegistry(options?.functionRegistry)
		return new ExecutionContext(
			blueprint,
			workflowState,
			nodeRegistry,
			executionId,
			this,
			{
				logger: this.logger,
				eventBus: this.eventBus,
				serializer: this.serializer,
				evaluator: this.evaluator,
				middleware: this.middleware,
				dependencies: this.dependencies,
			},
			options?.signal,
		)
	}

	async resume(
		blueprint: WorkflowBlueprint,
		serializedContext: string,
		resumeData: { output?: any; action?: string },
		nodeId?: string,
		options?: {
			functionRegistry?: Map<string, any>
			strict?: boolean
			signal?: AbortSignal
			concurrency?: number
		},
	): Promise<WorkflowResult<TContext>> {
		const executionId = globalThis.crypto?.randomUUID()
		const workflowState = new WorkflowState<TContext>(
			this.serializer.deserialize(serializedContext) as Partial<TContext>,
		)

		const awaitingNodeIds = workflowState.getAwaitingNodeIds()
		if (awaitingNodeIds.length === 0) {
			throw new FlowcraftError('Cannot resume: The provided context is not in an awaiting state.', {
				isFatal: true,
			})
		}

		const awaitingNodeId = nodeId || awaitingNodeIds[0]
		if (!awaitingNodeIds.includes(awaitingNodeId)) {
			throw new FlowcraftError(`Cannot resume: Node '${awaitingNodeId}' is not in an awaiting state.`, {
				isFatal: true,
			})
		}

		const awaitingNodeDef = blueprint.nodes.find((n) => n.id === awaitingNodeId)
		if (!awaitingNodeDef) {
			throw new FlowcraftError(`Awaiting node '${awaitingNodeId}' not found in blueprint.`, {
				nodeId: awaitingNodeId,
				blueprintId: blueprint.id,
				isFatal: true,
			})
		}

		const contextImpl = workflowState.getContext()

		if (awaitingNodeDef.uses === 'SubflowNode') {
			const subflowStateKey = `_subflowState.${awaitingNodeId}`
			const asyncContext = contextImpl
			const subflowContext = (await asyncContext.get(subflowStateKey as any)) as string

			if (!subflowContext) {
				throw new FlowcraftError(`Cannot resume: Subflow state for node '${awaitingNodeId}' not found.`, {
					nodeId: awaitingNodeId,
					blueprintId: blueprint.id,
					isFatal: true,
				})
			}

			const blueprintId = awaitingNodeDef.params?.blueprintId
			if (!blueprintId) {
				throw new FlowcraftError(`Subflow node '${awaitingNodeId}' is missing the 'blueprintId' parameter.`, {
					nodeId: awaitingNodeId,
					blueprintId: blueprint.id,
					isFatal: true,
				})
			}

			const subBlueprint = this.blueprints[blueprintId]
			if (!subBlueprint) {
				throw new FlowcraftError(`Sub-blueprint with ID '${blueprintId}' not found in runtime registry.`, {
					nodeId: awaitingNodeId,
					blueprintId: blueprint.id,
					isFatal: true,
				})
			}

			const subflowResumeResult = await this.resume(subBlueprint, subflowContext, resumeData, undefined, options)

			if (subflowResumeResult.status !== 'completed') {
				throw new FlowcraftError(
					`Resumed subflow '${subBlueprint.id}' did not complete. Status: ${subflowResumeResult.status}`,
					{
						nodeId: awaitingNodeId,
						blueprintId: blueprint.id,
						isFatal: false,
					},
				)
			}

			// mirror the output extraction logic from SubflowNode.exec
			const subflowFinalContext = subflowResumeResult.context as Record<string, any>
			let finalSubflowOutput: any
			const subAnalysis = analyzeBlueprint(subBlueprint)

			if (awaitingNodeDef.params?.outputs) {
				finalSubflowOutput = subflowFinalContext
			} else if (subAnalysis.terminalNodeIds.length === 1) {
				const terminalId = subAnalysis.terminalNodeIds[0]
				finalSubflowOutput = subflowFinalContext[`_outputs.${terminalId}`]
			} else {
				const terminalOutputs: Record<string, any> = {}
				for (const terminalId of subAnalysis.terminalNodeIds) {
					terminalOutputs[terminalId] = subflowFinalContext[`_outputs.${terminalId}`]
				}
				finalSubflowOutput = terminalOutputs
			}

			resumeData = { output: finalSubflowOutput }

			await contextImpl.delete(subflowStateKey as any)
		}

		workflowState.addCompletedNode(awaitingNodeId, resumeData.output)

		const nextSteps = await this.determineNextNodes(blueprint, awaitingNodeId, resumeData, contextImpl, executionId)

		if (nextSteps.length === 0) {
			workflowState.clearAwaiting(awaitingNodeId)
			const result = await workflowState.toResult(this.serializer)
			result.status = 'completed'
			return result
		}

		const traverserForResume = new GraphTraverser(blueprint)
		const allPredecessors = traverserForResume.getAllPredecessors()

		for (const { node, edge } of nextSteps) {
			await this.applyEdgeTransform(edge, resumeData, node, contextImpl, allPredecessors)
		}

		const traverser = GraphTraverser.fromState(blueprint, workflowState)

		const nextNodeDefs = nextSteps.map((s) => s.node)
		for (const nodeDef of nextNodeDefs) {
			traverser.addToFrontier(nodeDef.id)
		}

		workflowState.clearAwaiting(awaitingNodeId)

		const executionContext = this._setupResumedExecutionContext(blueprint, workflowState, options)

		return await this.orchestrator.run(executionContext, traverser)
	}

	public _createExecutionRegistry(dynamicRegistry?: Map<string, any>): Map<string, NodeFunction | NodeClass> {
		const executionRegistry = new Map(this.registry)
		if (dynamicRegistry) {
			for (const [key, func] of dynamicRegistry.entries()) {
				executionRegistry.set(key, func)
			}
		}
		return executionRegistry
	}

	async executeNode(
		blueprint: WorkflowBlueprint,
		nodeId: string,
		state: WorkflowState<TContext>,
		_allPredecessors?: Map<string, Set<string>>,
		functionRegistry?: Map<string, any>,
		executionId?: string,
		signal?: AbortSignal,
	): Promise<NodeResult<any, any>> {
		const nodeDef = blueprint.nodes.find((n) => n.id === nodeId)
		if (!nodeDef) {
			throw new FlowcraftError(`Node '${nodeId}' not found in blueprint.`, {
				nodeId,
				blueprintId: blueprint.id,
				executionId,
				isFatal: false,
			})
		}

		const contextImpl = state.getContext()
		const asyncContext = contextImpl

		const input = await this.resolveNodeInput(nodeDef.id, blueprint, asyncContext)
		const nodeRegistry = new Map([...this.registry, ...(functionRegistry || new Map())])

		const services = {
			logger: this.logger,
			eventBus: this.eventBus,
			serializer: this.serializer,
			evaluator: this.evaluator,
			middleware: this.middleware,
			dependencies: this.dependencies,
		}
		const context = new ExecutionContext(blueprint, state, nodeRegistry, executionId || '', this, services, signal)

		const executor = this.executorFactory.createExecutorForNode(nodeId, context)

		const executionResult = await executor.execute(input)

		if (executionResult.status === 'success') {
			return executionResult.result
		}

		if (executionResult.status === 'failed_with_fallback') {
			const fallbackNode = blueprint.nodes.find((n: NodeDefinition) => n.id === executionResult.fallbackNodeId)
			if (!fallbackNode) {
				throw new FlowcraftError(`Fallback node '${executionResult.fallbackNodeId}' not found in blueprint.`, {
					nodeId: nodeDef.id,
					blueprintId: blueprint.id,
					executionId,
					isFatal: false,
				})
			}

			const fallbackInput = await this.resolveNodeInput(fallbackNode.id, blueprint, asyncContext)
			const fallbackExecutor = this.executorFactory.createExecutorForNode(fallbackNode.id, context)

			const fallbackResult = await fallbackExecutor.execute(fallbackInput)
			if (fallbackResult.status === 'success') {
				state.markFallbackExecuted()
				state.addCompletedNode(executionResult.fallbackNodeId, fallbackResult.result.output)
				this.logger.info(`Fallback execution completed`, {
					nodeId: nodeDef.id,
					fallbackNodeId: executionResult.fallbackNodeId,
					executionId,
				})
				return { ...fallbackResult.result, _fallbackExecuted: true }
			}

			throw fallbackResult.error
		}

		throw executionResult.error
	}

	public getExecutorForNode(nodeId: string, context: ExecutionContext<TContext, TDependencies>): any {
		return this.executorFactory.createExecutorForNode(nodeId, context)
	}

	public createForSubflow(
		subBlueprint: WorkflowBlueprint,
		initialSubState: Partial<TContext>,
		executionId: string,
		signal?: AbortSignal,
	): ExecutionContext<TContext, TDependencies> {
		const subState = new WorkflowState<TContext>(initialSubState)
		return new ExecutionContext(
			subBlueprint,
			subState,
			this.registry,
			executionId,
			this,
			{
				logger: this.logger,
				eventBus: this.eventBus,
				serializer: this.serializer,
				evaluator: this.evaluator,
				middleware: this.middleware,
				dependencies: this.dependencies,
			},
			signal,
		)
	}

	async determineNextNodes(
		blueprint: WorkflowBlueprint,
		nodeId: string,
		result: NodeResult<any, any>,
		context: ContextImplementation<TContext>,
		executionId?: string,
	): Promise<{ node: NodeDefinition; edge: EdgeDefinition }[]> {
		return this.logicHandler.determineNextNodes(blueprint, nodeId, result, context, executionId)
	}

	public async applyEdgeTransform(
		edge: EdgeDefinition,
		sourceResult: NodeResult<any, any>,
		targetNode: NodeDefinition,
		context: ContextImplementation<TContext>,
		allPredecessors?: Map<string, Set<string>>,
	): Promise<void> {
		return this.logicHandler.applyEdgeTransform(edge, sourceResult, targetNode, context, allPredecessors)
	}

	public async resolveNodeInput(
		nodeId: string,
		blueprint: WorkflowBlueprint,
		context: ContextImplementation<TContext>,
	): Promise<any> {
		return this.logicHandler.resolveNodeInput(nodeId, blueprint, context)
	}
}

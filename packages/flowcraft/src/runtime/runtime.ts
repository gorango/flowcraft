import type { BlueprintAnalysis } from '../analysis'
import { analyzeBlueprint } from '../analysis'
import { DIContainer, ServiceTokens } from '../container'
import { AsyncContextView } from '../context'
import { FlowcraftError } from '../errors'
import { PropertyEvaluator } from '../evaluator'
import { NullLogger } from '../logger'
import { isNodeClass } from '../node'
import { BatchGatherNode } from '../nodes/batch-gather.node'
import { BatchScatterNode } from '../nodes/batch-scatter.node'
import { SubflowNode } from '../nodes/subflow.node'
import { WaitNode } from '../nodes/wait.node'
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
import type { ExecutionStrategy } from './executors'
import { ClassNodeExecutor, FunctionNodeExecutor, NodeExecutor } from './executors'
import { DefaultOrchestrator } from './orchestrator'
import { WorkflowState } from './state'
import { GraphTraverser } from './traverser'
import type { IOrchestrator, IRuntime } from './types'

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
					return { output: null }
				}
			}
			const builtInNodes = {
				wait: WaitNode,
				subflow: SubflowNode,
				'batch-scatter': BatchScatterNode,
				'batch-gather': BatchGatherNode,
				'loop-controller': loopControllerFunction,
			}
			this.registry = new Map(Object.entries({ ...builtInNodes, ...(options.registry || {}) }))
			this.blueprints = options.blueprints || {}
			this.dependencies = options.dependencies || ({} as TDependencies)
			this.options = options
			this.container = null as any
		}
		this.orchestrator = this.container?.has(ServiceTokens.Orchestrator)
			? this.container.resolve<IOrchestrator>(ServiceTokens.Orchestrator)
			: new DefaultOrchestrator()
		this.analysisCache = new WeakMap()
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
		const executionId = globalThis.crypto?.randomUUID()
		const startTime = Date.now()
		const contextData =
			typeof initialState === 'string' ? (this.serializer.deserialize(initialState) as Partial<TContext>) : initialState
		blueprint = sanitizeBlueprint(blueprint)
		const state = new WorkflowState<TContext>(contextData)

		this.logger.info(`Starting workflow execution`, {
			blueprintId: blueprint.id,
			executionId,
		})

		try {
			await this.eventBus.emit({ type: 'workflow:start', payload: { blueprintId: blueprint.id, executionId } })
			await this.eventBus.emit({ type: 'workflow:resume', payload: { blueprintId: blueprint.id, executionId } })
			// use cached analysis if available, otherwise compute and cache it
			const analysis =
				this.analysisCache.get(blueprint) ??
				(() => {
					const computed = analyzeBlueprint(blueprint)
					this.analysisCache.set(blueprint, computed)
					return computed
				})()
			if (options?.strict && !analysis.isDag) {
				throw new Error(`Workflow '${blueprint.id}' failed strictness check: Cycles are not allowed.`)
			}
			if (!analysis.isDag) {
				this.logger.warn(`Workflow contains cycles`, {
					blueprintId: blueprint.id,
				})
			}

			const nodeRegistry = this._createExecutionRegistry(options?.functionRegistry)
			const executionContext = new ExecutionContext(
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

			const traverser = new GraphTraverser(blueprint, options?.strict === true)
			const result = await this.orchestrator.run(executionContext, traverser)

			const duration = Date.now() - startTime
			if (result.status === 'stalled') {
				await this.eventBus.emit({
					type: 'workflow:stall',
					payload: {
						blueprintId: blueprint.id,
						executionId,
						remainingNodes: traverser.getAllNodeIds().size - state.getCompletedNodes().size,
					},
				})
				await this.eventBus.emit({ type: 'workflow:pause', payload: { blueprintId: blueprint.id, executionId } })
			}
			this.logger.info(`Workflow execution completed`, {
				blueprintId: blueprint.id,
				executionId,
				status: result.status,
				duration,
				errors: result.errors?.length || 0,
			})
			await this.eventBus.emit({
				type: 'workflow:finish',
				payload: {
					blueprintId: blueprint.id,
					executionId,
					status: result.status,
					errors: result.errors,
				},
			})
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
					blueprintId: blueprint.id,
					executionId,
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
					blueprintId: blueprint.id,
					executionId,
					duration,
				})
				await this.eventBus.emit({ type: 'workflow:pause', payload: { blueprintId: blueprint.id, executionId } })
				await this.eventBus.emit({
					type: 'workflow:finish',
					payload: {
						blueprintId: blueprint.id,
						executionId,
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
				blueprintId: blueprint.id,
				executionId,
				duration,
				error: error instanceof Error ? error.message : String(error),
			})
			throw error
		}
	}

	async resume(
		blueprint: WorkflowBlueprint,
		serializedContext: string,
		resumeData: { output?: any; action?: string },
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

		const awaitingNodeId = workflowState.getAwaitingNodeId()
		if (!awaitingNodeId) {
			throw new FlowcraftError('Cannot resume: The provided context is not in an awaiting state.', {
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

		if (awaitingNodeDef.uses === 'subflow') {
			const subflowStateKey = `_subflowState.${awaitingNodeId}`
			const contextImpl = workflowState.getContext()
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

			const subflowResumeResult = await this.resume(subBlueprint, subflowContext, resumeData, options)

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

			resumeData = { output: subflowResumeResult.context }
		}

		const contextImpl = workflowState.getContext()

		workflowState.addCompletedNode(awaitingNodeId, resumeData.output)

		const nextSteps = await this.determineNextNodes(blueprint, awaitingNodeId, resumeData, contextImpl, executionId)

		if (nextSteps.length === 0) {
			workflowState.clearAwaiting()
			const result = await workflowState.toResult(this.serializer)
			result.status = 'completed'
			return result
		}

		for (const { node, edge } of nextSteps) {
			await this.applyEdgeTransform(edge, resumeData, node, contextImpl)
		}

		const traverser = GraphTraverser.fromState(blueprint, workflowState)

		const nextNodeDefs = nextSteps.map((s) => s.node)
		for (const nodeDef of nextNodeDefs) {
			traverser.addToFrontier(nodeDef.id)
		}

		workflowState.clearAwaiting()

		const nodeRegistry = this._createExecutionRegistry(options?.functionRegistry)
		const executionContext = new ExecutionContext(
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
		const strategy = this.getExecutor(nodeDef, nodeRegistry as Map<string, any>)

		const services = {
			logger: this.logger,
			eventBus: this.eventBus,
			serializer: this.serializer,
			evaluator: this.evaluator,
			middleware: this.middleware,
			dependencies: this.dependencies,
		}
		const context = new ExecutionContext(blueprint, state, this.registry, executionId || '', this, services, signal)

		const executor = new NodeExecutor<TContext, TDependencies>({
			context,
			nodeDef,
			strategy,
		})

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
			const fallbackStrategy = this.getExecutor(fallbackNode, nodeRegistry as Map<string, any>)
			const fallbackExecutor = new NodeExecutor<TContext, TDependencies>({
				context,
				nodeDef: fallbackNode,
				strategy: fallbackStrategy,
			})

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
		const nodeDef = context.blueprint.nodes.find((n) => n.id === nodeId)
		if (!nodeDef) {
			throw new FlowcraftError(`Node '${nodeId}' not found in blueprint.`, {
				nodeId,
				blueprintId: context.blueprint.id,
				executionId: context.executionId,
				isFatal: false,
			})
		}
		return new NodeExecutor<TContext, TDependencies>({
			context,
			nodeDef,
			strategy: this.getExecutor(nodeDef, context.nodeRegistry),
		})
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
			this.registry, // Use the same registry
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

	public getExecutor(nodeDef: NodeDefinition, nodeRegistry: Map<string, NodeFunction | NodeClass>): ExecutionStrategy {
		const implementation = nodeRegistry.get(nodeDef.uses)
		if (!implementation) {
			throw new FlowcraftError(`Implementation for '${nodeDef.uses}' not found for node '${nodeDef.id}'.`, {
				nodeId: nodeDef.id,
				blueprintId: '',
				isFatal: true,
			})
		}
		const maxRetries = nodeDef.config?.maxRetries ?? 1
		return isNodeClass(implementation)
			? new ClassNodeExecutor(implementation, maxRetries, this.eventBus)
			: new FunctionNodeExecutor(implementation, maxRetries, this.eventBus)
	}

	async determineNextNodes(
		blueprint: WorkflowBlueprint,
		nodeId: string,
		result: NodeResult<any, any>,
		context: ContextImplementation<TContext>,
		executionId?: string,
	): Promise<{ node: NodeDefinition; edge: EdgeDefinition }[]> {
		const outgoingEdges = blueprint.edges.filter((edge) => edge.source === nodeId)
		const matched: { node: NodeDefinition; edge: EdgeDefinition }[] = []
		const evaluateEdge = async (edge: EdgeDefinition): Promise<boolean> => {
			if (!edge.condition) return true
			const contextData = context.type === 'sync' ? context.toJSON() : await context.toJSON()
			const evaluationResult = !!this.evaluator.evaluate(edge.condition, {
				...contextData,
				result,
			})
			await this.eventBus.emit({
				type: 'edge:evaluate',
				payload: { source: nodeId, target: edge.target, condition: edge.condition, result: evaluationResult },
			})
			return evaluationResult
		}
		if (result.action) {
			const actionEdges = outgoingEdges.filter((edge) => edge.action === result.action)
			for (const edge of actionEdges) {
				if (await evaluateEdge(edge)) {
					const targetNode = blueprint.nodes.find((n) => n.id === edge.target)
					if (targetNode) matched.push({ node: targetNode, edge })
				} else {
					await this.eventBus.emit({
						type: 'node:skipped',
						payload: { nodeId, edge, executionId: executionId || '', blueprintId: blueprint.id },
					})
				}
			}
		}
		if (matched.length === 0) {
			const defaultEdges = outgoingEdges.filter((edge) => !edge.action)
			for (const edge of defaultEdges) {
				if (await evaluateEdge(edge)) {
					const targetNode = blueprint.nodes.find((n) => n.id === edge.target)
					if (targetNode) matched.push({ node: targetNode, edge })
				} else {
					await this.eventBus.emit({
						type: 'node:skipped',
						payload: { nodeId, edge, executionId: executionId || '', blueprintId: blueprint.id },
					})
				}
			}
		}
		this.logger.debug(`Determined next nodes for ${nodeId}`, {
			matchedNodes: matched.map((m) => m.node.id),
			action: result.action,
		})
		return matched
	}

	public async applyEdgeTransform(
		edge: EdgeDefinition,
		sourceResult: NodeResult<any, any>,
		targetNode: NodeDefinition,
		context: ContextImplementation<TContext>,
		allPredecessors?: Map<string, Set<string>>,
	): Promise<void> {
		const asyncContext = context.type === 'sync' ? new AsyncContextView(context) : context
		const predecessors = allPredecessors?.get(targetNode.id)
		const hasSinglePredecessor = predecessors && predecessors.size === 1
		const hasExplicitInputs = targetNode.inputs !== undefined
		const hasEdgeTransform = edge.transform !== undefined
		if (!hasExplicitInputs && !hasSinglePredecessor && !hasEdgeTransform) {
			return
		}
		const finalInput = edge.transform
			? this.evaluator.evaluate(edge.transform, {
					input: sourceResult.output,
					context: await asyncContext.toJSON(),
				})
			: sourceResult.output
		const inputKey = `_inputs.${targetNode.id}`
		await asyncContext.set(inputKey as any, finalInput)
		await this.eventBus.emit({
			type: 'context:change',
			payload: { sourceNode: edge.source, key: inputKey, value: finalInput },
		})
		if (!hasExplicitInputs) {
			targetNode.inputs = inputKey
		}
	}

	public async resolveNodeInput(
		nodeId: string,
		blueprint: WorkflowBlueprint,
		context: ContextImplementation<TContext>,
	): Promise<any> {
		const nodeDef = blueprint.nodes.find((n) => n.id === nodeId)
		if (!nodeDef) {
			throw new FlowcraftError(`Node '${nodeId}' not found in blueprint.`, {
				nodeId,
				blueprintId: blueprint.id,
				isFatal: false,
			})
		}
		const asyncContext = context.type === 'sync' ? new AsyncContextView(context) : context
		if (nodeDef.inputs) {
			if (typeof nodeDef.inputs === 'string') {
				const key = nodeDef.inputs
				if (key.startsWith('_')) return await asyncContext.get(key as any)
				const outputKey = `_outputs.${key}`
				if (await asyncContext.has(outputKey as any)) {
					return await asyncContext.get(outputKey as any)
				}
				return await asyncContext.get(key as any)
			}
			if (typeof nodeDef.inputs === 'object') {
				const input: Record<string, any> = {}
				for (const key in nodeDef.inputs) {
					const contextKey = nodeDef.inputs[key]
					if (contextKey.startsWith('_')) {
						input[key] = await asyncContext.get(contextKey as any)
					} else {
						const outputKey = `_outputs.${contextKey}`
						if (await asyncContext.has(outputKey as any)) {
							input[key] = await asyncContext.get(outputKey as any)
						} else {
							input[key] = await asyncContext.get(contextKey as any)
						}
					}
				}
				return input
			}
		}
		// Default to standardized input key
		const inputKey = `_inputs.${nodeDef.id}`
		return await asyncContext.get(inputKey as any)
	}
}

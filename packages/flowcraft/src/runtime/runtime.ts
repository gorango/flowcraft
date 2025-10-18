import type { BlueprintAnalysis } from '../analysis'
import { analyzeBlueprint } from '../analysis'
import { AsyncContextView } from '../context'
import { FlowcraftError } from '../errors'
import { PropertyEvaluator } from '../evaluator'
import { NullLogger } from '../logger'
import type { BaseNode } from '../node'
import { isNodeClass } from '../node'
import { sanitizeBlueprint } from '../sanitizer'
import { JsonSerializer } from '../serializer'
import type {
	ContextImplementation,
	EdgeDefinition,
	IAsyncContext,
	IEvaluator,
	IEventBus,
	ILogger,
	ISerializer,
	ISyncContext,
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
import type { DynamicKeys } from './builtin-keys'
import type { ExecutionStrategy } from './executors'
import { BuiltInNodeExecutor, ClassNodeExecutor, FunctionNodeExecutor, NodeExecutor } from './executors'
import { RunToCompletionOrchestrator } from './orchestrator'
import { WorkflowState } from './state'
import { GraphTraverser } from './traverser'
import type { ExecutionServices, IOrchestrator, IRuntime } from './types'

type InternalFlowContext<TContext extends Record<string, any>> = TContext & Partial<DynamicKeys>

export class FlowRuntime<TContext extends Record<string, any>, TDependencies extends Record<string, any>>
	implements IRuntime<TContext, TDependencies>
{
	public registry: Record<string, NodeFunction | NodeClass | typeof BaseNode>
	private blueprints: Record<string, WorkflowBlueprint>
	private dependencies: TDependencies
	private logger: ILogger
	private eventBus: IEventBus
	private serializer: ISerializer
	private middleware: Middleware[]
	private evaluator: IEvaluator
	/**
	 * Cache for blueprint analysis results to avoid recomputing for the same blueprint object.
	 * Uses WeakMap to allow garbage collection of unused blueprints.
	 */
	private analysisCache: WeakMap<WorkflowBlueprint, BlueprintAnalysis>
	public options: RuntimeOptions<TDependencies>

	constructor(options: RuntimeOptions<TDependencies>) {
		this.registry = options.registry || {}
		this.blueprints = options.blueprints || {}
		this.dependencies = options.dependencies || ({} as TDependencies)
		this.logger = options.logger || new NullLogger()
		this.eventBus = options.eventBus || { emit: async () => {} }
		this.serializer = options.serializer || new JsonSerializer()
		this.middleware = options.middleware || []
		this.evaluator = options.evaluator || new PropertyEvaluator()
		this.analysisCache = new WeakMap()
		this.options = options
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
			const traverser = new GraphTraverser(blueprint, options?.strict === true)
			const nodeExecutorFactory = (dynamicBlueprint: WorkflowBlueprint) => (nodeId: string) => {
				const nodeDef = dynamicBlueprint.nodes.find((n) => n.id === nodeId)
				if (!nodeDef) {
					throw new FlowcraftError(`Node '${nodeId}' not found in blueprint.`, {
						nodeId,
						blueprintId: dynamicBlueprint.id,
						executionId,
						isFatal: false,
					})
				}
				return new NodeExecutor<TContext, TDependencies>({
					blueprint: dynamicBlueprint,
					nodeDef,
					state,
					dependencies: this.dependencies,
					logger: this.logger,
					eventBus: this.eventBus,
					middleware: this.middleware,
					strategy: this.getExecutor(nodeDef, options?.functionRegistry),
					executionId,
					signal: options?.signal,
				})
			}
			const executionServices: ExecutionServices = {
				determineNextNodes: this.determineNextNodes.bind(this),
				applyEdgeTransform: this.applyEdgeTransform.bind(this),
				resolveNodeInput: (nodeId: string, blueprint: WorkflowBlueprint, context: any) => {
					const nodeDef = blueprint.nodes.find((n) => n.id === nodeId)
					if (!nodeDef) return Promise.resolve(undefined)
					return this._resolveNodeInput(nodeDef, context)
				},
			}
			const orchestrator: IOrchestrator = new RunToCompletionOrchestrator()
			const result = await orchestrator.run(
				traverser,
				nodeExecutorFactory,
				state,
				executionServices,
				blueprint,
				options?.functionRegistry,
				executionId,
				this.evaluator,
				options?.signal,
				options?.concurrency,
			)

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
		const asyncContext: IAsyncContext<TContext> =
			contextImpl.type === 'sync'
				? new AsyncContextView(contextImpl as ISyncContext<TContext>)
				: (contextImpl as IAsyncContext<TContext>)

		const input = await this._resolveNodeInput(nodeDef, asyncContext)
		const strategy = this.getExecutor(nodeDef, functionRegistry)

		const executor = new NodeExecutor<TContext, TDependencies>({
			blueprint,
			nodeDef,
			state,
			dependencies: this.dependencies,
			logger: this.logger,
			eventBus: this.eventBus,
			middleware: this.middleware,
			strategy,
			executionId,
			signal,
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

			const fallbackInput = await this._resolveNodeInput(fallbackNode, asyncContext)
			const fallbackStrategy = this.getExecutor(fallbackNode, functionRegistry)
			const fallbackExecutor = new NodeExecutor<TContext, TDependencies>({
				blueprint,
				nodeDef: fallbackNode,
				state,
				dependencies: this.dependencies,
				logger: this.logger,
				eventBus: this.eventBus,
				middleware: this.middleware,
				strategy: fallbackStrategy,
				executionId,
				signal,
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

	private getExecutor(nodeDef: NodeDefinition, functionRegistry?: Map<string, any>): ExecutionStrategy {
		if (nodeDef.uses.startsWith('batch-') || nodeDef.uses.startsWith('loop-') || nodeDef.uses === 'subflow') {
			return new BuiltInNodeExecutor((nodeDef, context) =>
				this._executeBuiltInNode(
					nodeDef,
					context as ContextImplementation<InternalFlowContext<TContext>>,
					functionRegistry,
				),
			)
		}
		const implementation = functionRegistry?.get(nodeDef.uses) || this.registry[nodeDef.uses]
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

	private async _resolveNodeInput(nodeDef: NodeDefinition, context: IAsyncContext<TContext>): Promise<any> {
		if (nodeDef.inputs) {
			if (typeof nodeDef.inputs === 'string') {
				const key = nodeDef.inputs
				if (key.startsWith('_')) return await context.get(key as any)
				const outputKey = `_outputs.${key}`
				if (await context.has(outputKey as any)) {
					return await context.get(outputKey as any)
				}
				return await context.get(key as any)
			}
			if (typeof nodeDef.inputs === 'object') {
				const input: Record<string, any> = {}
				for (const key in nodeDef.inputs) {
					const contextKey = nodeDef.inputs[key]
					if (contextKey.startsWith('_')) {
						input[key] = await context.get(contextKey as any)
					} else {
						const outputKey = `_outputs.${contextKey}`
						if (await context.has(outputKey as any)) {
							input[key] = await context.get(outputKey as any)
						} else {
							input[key] = await context.get(contextKey as any)
						}
					}
				}
				return input
			}
		}
		// Default to standardized input key
		const inputKey = `_inputs.${nodeDef.id}`
		return await context.get(inputKey as any)
	}

	protected async _executeBuiltInNode(
		nodeDef: NodeDefinition,
		contextImpl: ContextImplementation<InternalFlowContext<TContext>>,
		functionRegistry?: Map<string, any>,
	): Promise<NodeResult<any, any>> {
		const context = contextImpl.type === 'sync' ? new AsyncContextView(contextImpl) : contextImpl
		const { params = {}, id, inputs } = nodeDef
		const resolvedInput = await this._resolveNodeInput(nodeDef, context)
		switch (nodeDef.uses) {
			case 'batch-scatter': {
				const inputArray = resolvedInput || []
				if (!Array.isArray(inputArray))
					throw new FlowcraftError(`Input for batch-scatter node '${id}' must be an array.`, {
						nodeId: id,
						blueprintId: '',
						isFatal: true,
					})
				const batchId = globalThis.crypto.randomUUID()
				const chunkSize = params.chunkSize || inputArray.length
				const currentIndex = (await context.get(`${id}_currentIndex`)) || 0
				const endIndex = Math.min(currentIndex + chunkSize, inputArray.length)
				const dynamicNodes: NodeDefinition[] = []
				const workerIds = []
				for (let i = currentIndex; i < endIndex; i++) {
					const item = inputArray[i]
					const itemInputKey = `_batch.${id}_${batchId}_item_${i}`
					await context.set(itemInputKey as any, item)
					const workerId = `${params.workerUsesKey}_${batchId}_${i}`
					workerIds.push(workerId)
					dynamicNodes.push({
						id: workerId,
						uses: params.workerUsesKey,
						inputs: itemInputKey,
					})
				}
				// update current index for next chunk
				await context.set(`${id}_currentIndex`, endIndex)
				const gatherNodeId = params.gatherNodeId
				const hasMore = endIndex < inputArray.length
				await context.set(`${gatherNodeId}_hasMore`, hasMore)
				// accumulate worker ids for all chunks
				const existingWorkerIds = (await context.get(`${gatherNodeId}_allWorkerIds`)) || []
				const allWorkerIds = [...existingWorkerIds, ...workerIds]
				await context.set(`${gatherNodeId}_allWorkerIds`, allWorkerIds)
				return { dynamicNodes, output: { gatherNodeId, hasMore } }
			}
			case 'batch-gather': {
				const { gatherNodeId, outputKey } = params
				const hasMore = (await context.get(`${gatherNodeId}_hasMore`)) || false
				const dynamicNodes: NodeDefinition[] = []
				let results: any[] = []
				if (hasMore) {
					// create a new scatter node for the next chunk
					const newScatterId = `${gatherNodeId}_scatter_next`
					dynamicNodes.push({
						id: newScatterId,
						uses: 'batch-scatter',
						inputs: inputs, // use the same input as the original scatter
						params: { ...params, gatherNodeId },
					})
				} else {
					// collect results from all chunks into outputKey
					const allWorkerIds = ((await context.get(`${gatherNodeId}_allWorkerIds`)) as string[]) || []
					results = []
					for (const workerId of allWorkerIds) {
						// the output of a node is stored in the _outputs namespace.
						const result = await context.get(`_outputs.${workerId}` as any)
						if (result !== undefined) results.push(result)
					}
					await context.set(outputKey as any, results)
				}
				return { dynamicNodes, output: results }
			}
			case 'loop-controller': {
				const contextData = await context.toJSON()
				const shouldContinue = !!this.evaluator.evaluate(params.condition, contextData)
				return {
					action: shouldContinue ? 'continue' : 'break',
					output: shouldContinue ? undefined : await context.get('_inputs.loop-controller'),
				}
			}
			case 'subflow': {
				const { blueprintId, inputs: inputMapping, outputs: outputMapping } = params
				if (!blueprintId)
					throw new FlowcraftError(`Subflow node '${id}' is missing the 'blueprintId' parameter.`, {
						nodeId: id,
						blueprintId: '',
						isFatal: true,
					})

				const subBlueprint = this.blueprints[blueprintId]
				if (!subBlueprint)
					throw new FlowcraftError(`Sub-blueprint with ID '${blueprintId}' not found in runtime registry.`, {
						nodeId: id,
						blueprintId: '',
						isFatal: true,
					})

				const subflowInitialContext: Record<string, any> = {}

				if (inputMapping) {
					for (const [targetKey, sourceKey] of Object.entries(inputMapping)) {
						const sourceKeyStr = String(sourceKey)
						let actualKey = sourceKeyStr
						if (!sourceKeyStr.startsWith('_')) {
							actualKey = `_outputs.${sourceKeyStr}`
						}
						if (await context.has(actualKey as any)) {
							subflowInitialContext[targetKey] = await context.get(actualKey as any)
						} else if (await context.has(sourceKeyStr as any)) {
							subflowInitialContext[targetKey] = await context.get(sourceKeyStr as any)
						}
					}
				}

				const subflowResult = await this.run(subBlueprint, subflowInitialContext as Partial<TContext>, {
					functionRegistry,
				})

				if (subflowResult.status !== 'completed') {
					const errorMessage = `Sub-workflow '${blueprintId}' did not complete successfully. Status: ${subflowResult.status}`
					let originalError: Error | undefined

					if (subflowResult.errors && subflowResult.errors.length > 0) {
						const firstError = subflowResult.errors[0]
						const rootCause = firstError.cause
						const errorDetails = rootCause ? `: ${(rootCause as Error).message}` : ''
						originalError = new Error(`${firstError.message}${errorDetails} (Node: ${firstError.nodeId})`)
						originalError.stack = firstError.stack || originalError.stack
					}

					throw new FlowcraftError(errorMessage, {
						cause: originalError,
						nodeId: id,
						blueprintId: subBlueprint.id,
						isFatal: false,
					})
				}

				if (outputMapping) {
					for (const [parentKey, subKey] of Object.entries(outputMapping)) {
						const subflowFinalContext = subflowResult.context as Record<string, any>
						const subKeyStr = String(subKey)
						let actualSubKey = subKeyStr
						if (!subKeyStr.startsWith('_')) {
							actualSubKey = `_outputs.${subKeyStr}`
						}
						if (Object.hasOwn(subflowFinalContext, actualSubKey)) {
							await context.set(parentKey as any, subflowFinalContext[actualSubKey])
						} else if (Object.hasOwn(subflowFinalContext, subKeyStr)) {
							await context.set(parentKey as any, subflowFinalContext[subKeyStr])
						}
					}
				}

				return { output: subflowResult.context }
			}
			default:
				throw new FlowcraftError(`Unknown built-in node type: '${nodeDef.uses}'`, {
					nodeId: id,
					blueprintId: '',
					isFatal: true,
				})
		}
	}
}

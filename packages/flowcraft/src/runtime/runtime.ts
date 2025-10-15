import { analyzeBlueprint } from '../analysis'
import { AsyncContextView } from '../context'
import { CancelledWorkflowError, FatalNodeExecutionError, NodeExecutionError } from '../errors'
import { SimpleEvaluator } from '../evaluator'
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
	NodeContext,
	NodeDefinition,
	NodeFunction,
	NodeResult,
	RuntimeOptions,
	WorkflowBlueprint,
	WorkflowResult,
} from '../types'
import type { ExecutionStrategy } from './executors'
import { BuiltInNodeExecutor, ClassNodeExecutor, FunctionNodeExecutor } from './executors'
import { WorkflowState } from './state'
import { GraphTraverser } from './traverser'
import type { IRuntime } from './types'

export class FlowRuntime<TContext extends Record<string, any>, TDependencies extends Record<string, any>>
	implements IRuntime<TContext, TDependencies>
{
	private registry: Record<string, NodeFunction | NodeClass | typeof BaseNode>
	private blueprints: Record<string, WorkflowBlueprint>
	private dependencies: TDependencies
	private logger: ILogger
	private eventBus: IEventBus
	private serializer: ISerializer
	private middleware: Middleware[]
	private evaluator: IEvaluator
	public options: RuntimeOptions<TDependencies>

	constructor(options: RuntimeOptions<TDependencies>) {
		this.registry = options.registry || {}
		this.blueprints = options.blueprints || {}
		this.dependencies = options.dependencies || ({} as TDependencies)
		this.logger = options.logger || new NullLogger()
		this.eventBus = options.eventBus || { emit: () => {} }
		this.serializer = options.serializer || new JsonSerializer()
		this.middleware = options.middleware || []
		this.evaluator = options.evaluator || new SimpleEvaluator()
		this.options = options
	}

	async run(
		blueprint: WorkflowBlueprint,
		initialState: Partial<TContext> | string = {},
		options?: {
			functionRegistry?: Map<string, any>
			strict?: boolean
			signal?: AbortSignal
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
			await this.eventBus.emit('workflow:start', {
				blueprintId: blueprint.id,
				executionId,
			})
			const analysis = analyzeBlueprint(blueprint)
			if (options?.strict && !analysis.isDag) {
				throw new Error(`Workflow '${blueprint.id}' failed strictness check: Cycles are not allowed.`)
			}
			if (!analysis.isDag) {
				this.logger.warn(`Workflow contains cycles`, {
					blueprintId: blueprint.id,
				})
			}
			const traverser = new GraphTraverser<TContext, TDependencies>(
				blueprint,
				this,
				state,
				options?.functionRegistry,
				executionId,
				options?.signal,
			)
			await traverser.traverse()
			const status = state.getStatus(traverser.getAllNodeIds(), traverser.getFallbackNodeIds())
			const result = state.toResult(this.serializer)
			result.status = status
			const duration = Date.now() - startTime
			if (status === 'stalled') {
				await this.eventBus.emit('workflow:stall', {
					blueprintId: blueprint.id,
					executionId,
					remainingNodes: traverser.getAllNodeIds().size - state.getCompletedNodes().size,
				})
			}
			this.logger.info(`Workflow execution completed`, {
				blueprintId: blueprint.id,
				executionId,
				status,
				duration,
				errors: result.errors?.length || 0,
			})
			await this.eventBus.emit('workflow:finish', {
				blueprintId: blueprint.id,
				executionId,
				status,
				errors: result.errors,
			})
			return result
		} catch (error) {
			const duration = Date.now() - startTime
			if (error instanceof DOMException ? error.name === 'AbortError' : error instanceof CancelledWorkflowError) {
				this.logger.info(`Workflow execution cancelled`, {
					blueprintId: blueprint.id,
					executionId,
					duration,
				})
				await this.eventBus.emit('workflow:finish', {
					blueprintId: blueprint.id,
					executionId,
					status: 'cancelled',
					error,
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
		allPredecessors?: Map<string, Set<string>>,
		functionRegistry?: Map<string, any>,
		executionId?: string,
		signal?: AbortSignal,
	): Promise<NodeResult<any, any>> {
		const nodeDef = blueprint.nodes.find((n) => n.id === nodeId)
		if (!nodeDef) {
			throw new NodeExecutionError(
				`Node '${nodeId}' not found in blueprint.`,
				nodeId,
				blueprint.id,
				undefined,
				executionId,
			)
		}

		const contextImpl = state.getContext()
		const asyncContext: IAsyncContext<TContext> =
			contextImpl.type === 'sync'
				? new AsyncContextView(contextImpl as ISyncContext<TContext>)
				: (contextImpl as IAsyncContext<TContext>)
		const nodeContext: NodeContext<TContext, TDependencies, any> = {
			context: asyncContext,
			input: await this._resolveNodeInput(nodeDef, asyncContext, allPredecessors),
			params: nodeDef.params || {},
			dependencies: { ...this.dependencies, logger: this.logger },
			signal,
		}

		const beforeHooks = this.middleware
			.map((m) => m.beforeNode)
			.filter((hook): hook is NonNullable<Middleware['beforeNode']> => !!hook)
		const afterHooks = this.middleware
			.map((m) => m.afterNode)
			.filter((hook): hook is NonNullable<Middleware['afterNode']> => !!hook)
		const aroundHooks = this.middleware
			.map((m) => m.aroundNode)
			.filter((hook): hook is NonNullable<Middleware['aroundNode']> => !!hook)

		const executor = this.getExecutor(nodeDef, functionRegistry)
		const coreExecution = async (): Promise<NodeResult> => {
			let result: NodeResult | undefined
			let error: Error | undefined
			try {
				for (const hook of beforeHooks) await hook(nodeContext.context, nodeId)
				result = await this.executeWithFallback(
					blueprint,
					nodeDef,
					nodeContext,
					executor,
					executionId,
					signal,
					state,
					functionRegistry,
				)
				return result
			} catch (e: any) {
				error = e
				throw e
			} finally {
				for (const hook of afterHooks) await hook(nodeContext.context, nodeId, result, error)
			}
		}

		let executionChain: () => Promise<NodeResult> = coreExecution
		for (let i = aroundHooks.length - 1; i >= 0; i--) {
			const hook = aroundHooks[i]
			const next = executionChain
			executionChain = () => hook(nodeContext.context, nodeId, next)
		}

		try {
			await this.eventBus.emit('node:start', {
				blueprintId: blueprint.id,
				nodeId,
				executionId,
			})
			const result = await executionChain()
			await this.eventBus.emit('node:finish', {
				blueprintId: blueprint.id,
				nodeId,
				result,
				executionId,
			})
			return result
		} catch (error: any) {
			await this.eventBus.emit('node:error', {
				blueprintId: blueprint.id,
				nodeId,
				error,
				executionId,
			})
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new CancelledWorkflowError('Workflow cancelled')
			}
			throw error instanceof NodeExecutionError
				? error
				: new NodeExecutionError(`Node '${nodeId}' failed execution.`, nodeId, blueprint.id, error, executionId)
		}
	}

	private getExecutor(nodeDef: NodeDefinition, functionRegistry?: Map<string, any>): ExecutionStrategy {
		if (nodeDef.uses.startsWith('batch-') || nodeDef.uses.startsWith('loop-') || nodeDef.uses === 'subflow') {
			return new BuiltInNodeExecutor((nodeDef, context) => this._executeBuiltInNode(nodeDef, context))
		}
		const implementation = functionRegistry?.get(nodeDef.uses) || this.registry[nodeDef.uses]
		if (!implementation) {
			throw new FatalNodeExecutionError(
				`Implementation for '${nodeDef.uses}' not found for node '${nodeDef.id}'.`,
				nodeDef.id,
				'',
			)
		}
		const maxRetries = nodeDef.config?.maxRetries ?? 1
		return isNodeClass(implementation)
			? new ClassNodeExecutor(implementation, maxRetries, this.eventBus)
			: new FunctionNodeExecutor(implementation, maxRetries, this.eventBus)
	}

	private async executeWithFallback(
		blueprint: WorkflowBlueprint,
		nodeDef: NodeDefinition,
		context: NodeContext<TContext, TDependencies, any>,
		executor: ExecutionStrategy,
		executionId?: string,
		signal?: AbortSignal,
		state?: WorkflowState<TContext>,
		functionRegistry?: Map<string, any>,
	): Promise<NodeResult<any, any>> {
		try {
			return await executor.execute(nodeDef, context, executionId, signal)
		} catch (error) {
			const isFatal =
				error instanceof FatalNodeExecutionError ||
				(error instanceof NodeExecutionError && error.originalError instanceof FatalNodeExecutionError)
			if (isFatal) throw error
			const fallbackNodeId = nodeDef.config?.fallback
			if (fallbackNodeId && state) {
				context.dependencies.logger.warn(`Executing fallback for node`, {
					nodeId: nodeDef.id,
					fallbackNodeId,
					error: error instanceof Error ? error.message : String(error),
					executionId,
				})
				await this.eventBus.emit('node:fallback', {
					blueprintId: blueprint.id,
					nodeId: nodeDef.id,
					executionId,
					fallback: fallbackNodeId,
				})
				const fallbackNode = blueprint.nodes.find((n: NodeDefinition) => n.id === fallbackNodeId)
				if (!fallbackNode) {
					throw new NodeExecutionError(
						`Fallback node '${fallbackNodeId}' not found in blueprint.`,
						nodeDef.id,
						blueprint.id,
						undefined,
						executionId,
					)
				}
				const fallbackExecutor = this.getExecutor(fallbackNode, functionRegistry)
				const fallbackResult = await fallbackExecutor.execute(fallbackNode, context, executionId, signal)
				state.markFallbackExecuted()
				context.dependencies.logger.info(`Fallback execution completed`, {
					nodeId: nodeDef.id,
					fallbackNodeId,
					executionId,
				})
				return { ...fallbackResult, _fallbackExecuted: true }
			}
			throw error
		}
	}

	async determineNextNodes(
		blueprint: WorkflowBlueprint,
		nodeId: string,
		result: NodeResult<any, any>,
		context: ContextImplementation<TContext>,
	): Promise<{ node: NodeDefinition; edge: EdgeDefinition }[]> {
		const outgoingEdges = blueprint.edges.filter((edge) => edge.source === nodeId)
		const matched: { node: NodeDefinition; edge: EdgeDefinition }[] = []
		const evaluateEdge = async (edge: EdgeDefinition): Promise<boolean> => {
			if (!edge.condition) return true
			const contextData = context.type === 'sync' ? context.toJSON() : await context.toJSON()
			return !!this.evaluator.evaluate(edge.condition, {
				...contextData,
				result,
			})
		}
		if (result.action) {
			const actionEdges = outgoingEdges.filter((edge) => edge.action === result.action)
			for (const edge of actionEdges) {
				if (await evaluateEdge(edge)) {
					const targetNode = blueprint.nodes.find((n) => n.id === edge.target)
					if (targetNode) matched.push({ node: targetNode, edge })
				}
			}
		}
		if (matched.length === 0) {
			const defaultEdges = outgoingEdges.filter((edge) => !edge.action)
			for (const edge of defaultEdges) {
				if (await evaluateEdge(edge)) {
					const targetNode = blueprint.nodes.find((n) => n.id === edge.target)
					if (targetNode) matched.push({ node: targetNode, edge })
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
		const finalInput = edge.transform
			? this.evaluator.evaluate(edge.transform, {
					input: sourceResult.output,
					context: await asyncContext.toJSON(),
				})
			: sourceResult.output
		const inputKey = `${targetNode.id}_input`
		await asyncContext.set(inputKey as any, finalInput)
		if (targetNode.config?.joinStrategy === 'any') {
			targetNode.inputs = inputKey
		} else if (!targetNode.inputs) {
			const predecessors = allPredecessors?.get(targetNode.id)
			if (!predecessors || predecessors.size === 1) {
				targetNode.inputs = inputKey
			}
		}
	}

	private async _resolveNodeInput(
		nodeDef: NodeDefinition,
		context: IAsyncContext<TContext>,
		allPredecessors?: Map<string, Set<string>>,
	): Promise<any> {
		if (nodeDef.inputs) {
			if (typeof nodeDef.inputs === 'string') return await context.get(nodeDef.inputs as any)
			if (typeof nodeDef.inputs === 'object') {
				const input: Record<string, any> = {}
				for (const key in nodeDef.inputs) {
					const contextKey = nodeDef.inputs[key]
					input[key] = await context.get(contextKey as any)
				}
				return input
			}
		}
		if (allPredecessors) {
			const predecessors = allPredecessors.get(nodeDef.id)
			if (predecessors && predecessors.size === 1) {
				const singlePredecessorId = predecessors.values().next().value
				return await context.get(singlePredecessorId as any)
			}
		}
		return undefined
	}

	protected async _executeBuiltInNode(
		nodeDef: NodeDefinition,
		contextImpl: ContextImplementation<TContext>,
	): Promise<NodeResult<any, any>> {
		const context = contextImpl.type === 'sync' ? new AsyncContextView(contextImpl) : contextImpl
		const { params = {}, id, inputs } = nodeDef
		switch (nodeDef.uses) {
			case 'batch-scatter': {
				const inputArray = (await context.get(inputs as any)) || []
				if (!Array.isArray(inputArray)) throw new Error(`Input for batch-scatter node '${id}' must be an array.`)
				const batchId = globalThis.crypto.randomUUID()
				const dynamicNodes: NodeDefinition[] = []
				for (let i = 0; i < inputArray.length; i++) {
					const item = inputArray[i]
					const itemInputKey = `${id}_${batchId}_item_${i}`
					await context.set(itemInputKey as any, item)
					dynamicNodes.push({
						id: `${params.workerUsesKey}_${batchId}_${i}`,
						uses: params.workerUsesKey,
						inputs: itemInputKey,
					})
				}
				const gatherNodeId = params.gatherNodeId
				return { dynamicNodes, output: { gatherNodeId } }
			}
			case 'batch-gather': {
				return { output: {} }
			}
			case 'loop-controller': {
				const contextData = await context.toJSON()
				const shouldContinue = !!this.evaluator.evaluate(params.condition, contextData)
				return { action: shouldContinue ? 'continue' : 'break' }
			}
			case 'subflow': {
				const { blueprintId, inputs: inputMapping, outputs: outputMapping } = params
				if (!blueprintId)
					throw new FatalNodeExecutionError(`Subflow node '${id}' is missing the 'blueprintId' parameter.`, id, '')

				const subBlueprint = this.blueprints[blueprintId]
				if (!subBlueprint)
					throw new FatalNodeExecutionError(
						`Sub-blueprint with ID '${blueprintId}' not found in runtime registry.`,
						id,
						'',
					)

				const subflowInitialContext: Record<string, any> = {}

				if (inputMapping) {
					for (const [targetKey, sourceKey] of Object.entries(inputMapping)) {
						if (await context.has(sourceKey as any)) {
							subflowInitialContext[targetKey] = await context.get(sourceKey as any)
						}
					}
				}

				const subflowResult = await this.run(subBlueprint, subflowInitialContext as Partial<TContext>)

				if (subflowResult.status !== 'completed')
					throw new NodeExecutionError(
						`Sub-workflow '${blueprintId}' did not complete successfully. Status: ${subflowResult.status}`,
						id,
						subBlueprint.id,
					)

				if (outputMapping) {
					for (const [parentKey, subKey] of Object.entries(outputMapping)) {
						const subflowFinalContext = subflowResult.context as Record<string, any>
						if (Object.hasOwn(subflowFinalContext, subKey as string)) {
							await context.set(parentKey as any, subflowFinalContext[subKey as string])
						}
					}
				}

				return { output: subflowResult.context }
			}
			default:
				throw new FatalNodeExecutionError(`Unknown built-in node type: '${nodeDef.uses}'`, id, '')
		}
	}
}

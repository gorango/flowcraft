import type { BaseNode } from './node'
import type {
	ContextImplementation,
	EdgeDefinition,
	IAsyncContext,
	IEvaluator,
	IEventBus,
	ISerializer,
	ISyncContext,
	Middleware,
	NodeContext,
	NodeDefinition,
	NodeFunction,
	NodeResult,
	RuntimeOptions,
	WorkflowBlueprint,
	WorkflowError,
	WorkflowResult,
} from './types'
import { analyzeBlueprint } from './analysis'
import { AsyncContextView, Context } from './context'
import { CancelledWorkflowError, FatalNodeExecutionError, NodeExecutionError } from './errors'
import { SimpleEvaluator } from './evaluator'
import { isNodeClass } from './node'
import { JsonSerializer } from './serializer'

class WorkflowState<TContext extends Record<string, any>> {
	private _completedNodes = new Set<string>()
	private errors: WorkflowError[] = []
	private anyFallbackExecuted = false
	private context: ContextImplementation<TContext>

	constructor(initialData: Partial<TContext>) {
		this.context = new Context<TContext>(initialData)
	}

	addCompletedNode(nodeId: string, output: any) {
		this._completedNodes.add(nodeId)
		this.context.set(nodeId as any, output)
	}

	addError(nodeId: string, error: Error) {
		this.errors.push({
			nodeId,
			message: error.message,
			originalError: error instanceof NodeExecutionError ? error.originalError || error : error,
		})
	}

	clearError(nodeId: string) {
		this.errors = this.errors.filter(err => err.nodeId !== nodeId)
	}

	markFallbackExecuted() {
		this.anyFallbackExecuted = true
	}

	getContext(): ContextImplementation<TContext> {
		return this.context
	}

	getCompletedNodes(): Set<string> {
		return new Set(this._completedNodes)
	}

	getStatus(allNodeIds: Set<string>, fallbackNodeIds: Set<string>): WorkflowResult['status'] {
		if (this.anyFallbackExecuted)
			return 'completed'
		if (this.errors.length > 0)
			return 'failed'
		const _remainingNodes = [...allNodeIds].filter(id => !this._completedNodes.has(id) && !fallbackNodeIds.has(id))
		return this._completedNodes.size < allNodeIds.size ? 'stalled' : 'completed'
	}

	toResult(serializer: ISerializer): WorkflowResult<TContext> {
		const contextJSON = this.context.toJSON() as TContext
		return {
			context: contextJSON,
			serializedContext: serializer.serialize(contextJSON),
			status: this.getStatus(new Set(), new Set()),
			errors: this.errors.length > 0 ? this.errors : undefined,
		}
	}
}

interface ExecutionStrategy {
	execute: (
		nodeDef: NodeDefinition,
		context: NodeContext<any, any>,
		executionId?: string,
		signal?: AbortSignal,
	) => Promise<NodeResult>
}

class FunctionNodeExecutor implements ExecutionStrategy {
	constructor(
		private implementation: NodeFunction,
		private maxRetries: number,
		private eventBus: IEventBus,
	) { }

	async execute(
		nodeDef: NodeDefinition,
		context: NodeContext<any, any>,
		executionId?: string,
		signal?: AbortSignal,
	): Promise<NodeResult> {
		let lastError: any
		for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
			try {
				signal?.throwIfAborted()
				return await this.implementation(context)
			}
			catch (error) {
				lastError = error
				if (error instanceof DOMException && error.name === 'AbortError') {
					throw new CancelledWorkflowError('Workflow cancelled')
				}
				if (error instanceof FatalNodeExecutionError)
					break
				if (attempt < this.maxRetries) {
					await this.eventBus.emit('node:retry', { blueprintId: context.dependencies.blueprint?.id || '', nodeId: nodeDef.id, attempt, executionId })
				}
			}
		}
		throw lastError
	}
}

class ClassNodeExecutor implements ExecutionStrategy {
	constructor(
		private implementation: typeof BaseNode,
		private maxRetries: number,
		private eventBus: IEventBus,
	) { }

	async execute(
		nodeDef: NodeDefinition,
		context: NodeContext<any, any>,
		executionId?: string,
		signal?: AbortSignal,
	): Promise<NodeResult> {
		const instance = new (this.implementation as new (params: Record<string, any>) => BaseNode)(nodeDef.params || {})
		try {
			signal?.throwIfAborted()
			const prepResult = await instance.prep(context)
			let execResult: Omit<NodeResult, 'error'>
			let lastError: any
			for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
				try {
					signal?.throwIfAborted()
					execResult = await instance.exec(prepResult, context)
					lastError = undefined
					break
				}
				catch (error) {
					lastError = error
					if (error instanceof DOMException && error.name === 'AbortError') {
						throw new CancelledWorkflowError('Workflow cancelled')
					}
					if (error instanceof FatalNodeExecutionError)
						break
					if (attempt < this.maxRetries) {
						await this.eventBus.emit('node:retry', { blueprintId: context.dependencies.blueprint?.id || '', nodeId: nodeDef.id, attempt, executionId })
					}
				}
			}
			if (lastError) {
				signal?.throwIfAborted()
				execResult = await instance.fallback(lastError, context)
			}
			signal?.throwIfAborted()
			return await instance.post(execResult!, context)
		}
		catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new CancelledWorkflowError('Workflow cancelled')
			}
			throw error
		}
	}
}

class BuiltInNodeExecutor implements ExecutionStrategy {
	constructor(
		private executeBuiltIn: (nodeDef: NodeDefinition, context: ContextImplementation<any>) => Promise<NodeResult>,
	) { }

	async execute(
		nodeDef: NodeDefinition,
		context: NodeContext<any, any>,
	): Promise<NodeResult> {
		return this.executeBuiltIn(nodeDef, context.context as ContextImplementation<any>)
	}
}

class GraphTraverser<TContext extends Record<string, any>, TDependencies extends Record<string, any>> {
	private frontier = new Set<string>()
	private allPredecessors: Map<string, Set<string>>
	private dynamicBlueprint: WorkflowBlueprint

	constructor(
		private blueprint: WorkflowBlueprint,
		private runtime: FlowRuntime<TContext, TDependencies>,
		private state: WorkflowState<TContext>,
		private functionRegistry: Map<string, any> | undefined,
		private executionId: string,
		private signal?: AbortSignal,
	) {
		this.dynamicBlueprint = JSON.parse(JSON.stringify(blueprint)) as WorkflowBlueprint
		this.allPredecessors = new Map<string, Set<string>>()
		this.dynamicBlueprint.nodes.forEach(node => this.allPredecessors.set(node.id, new Set()))
		this.dynamicBlueprint.edges.forEach(edge => this.allPredecessors.get(edge.target)?.add(edge.source))
		const analysis = analyzeBlueprint(blueprint)
		this.frontier = new Set(analysis.startNodeIds.filter(id => !this.isFallbackNode(id)))
		if (this.frontier.size === 0 && analysis.cycles.length > 0 && this.runtime.options.strict !== true) {
			const uniqueStartNodes = new Set<string>()
			for (const cycle of analysis.cycles) {
				if (cycle.length > 0)
					uniqueStartNodes.add(cycle[0])
			}
			this.frontier = new Set(uniqueStartNodes)
		}
	}

	private isFallbackNode(nodeId: string): boolean {
		return this.dynamicBlueprint.nodes.some(n => n.config?.fallback === nodeId)
	}

	async traverse(): Promise<void> {
		while (this.frontier.size > 0) {
			try {
				this.signal?.throwIfAborted()
				const currentJobs = Array.from(this.frontier)
				this.frontier.clear()
				const promises = currentJobs.map(nodeId =>
					this.runtime
						.executeNode(this.dynamicBlueprint, nodeId, this.state, this.allPredecessors, this.functionRegistry, this.executionId, this.signal)
						.then(result => ({ status: 'fulfilled' as const, value: { nodeId, result } }))
						.catch(error => ({ status: 'rejected' as const, reason: { nodeId, error } })),
				)
				const settledResults = await Promise.all(promises)
				const completedThisTurn = new Set<string>()
				for (const promiseResult of settledResults) {
					if (promiseResult.status === 'rejected') {
						const { nodeId, error } = promiseResult.reason
						if (error instanceof CancelledWorkflowError)
							throw error
						this.state.addError(nodeId, error)
						continue
					}
					const { nodeId, result } = promiseResult.value
					this.state.addCompletedNode(nodeId, result.output)
					completedThisTurn.add(nodeId)
					if (result._fallbackExecuted)
						this.state.markFallbackExecuted()
					await this.handleDynamicNodes(nodeId, result)
					if (!result._fallbackExecuted) {
						const matched = await this.runtime.determineNextNodes(this.dynamicBlueprint, nodeId, result, this.state.getContext())
						for (const { node, edge } of matched) {
							const joinStrategy = node.config?.joinStrategy || 'all'
							if (joinStrategy !== 'any' && this.state.getCompletedNodes().has(node.id))
								continue
							await this.runtime.applyEdgeTransform(edge, result, node, this.state.getContext(), this.allPredecessors)
							const requiredPredecessors = this.allPredecessors.get(node.id)!
							const isReady = joinStrategy === 'any'
								? [...requiredPredecessors].some(p => completedThisTurn.has(p))
								: [...requiredPredecessors].every(p => this.state.getCompletedNodes().has(p))
							if (isReady)
								this.frontier.add(node.id)
						}
						if (matched.length === 0) {
							for (const [potentialNextId, predecessors] of this.allPredecessors) {
								if (predecessors.has(nodeId) && !this.state.getCompletedNodes().has(potentialNextId)) {
									const joinStrategy = this.dynamicBlueprint.nodes.find(n => n.id === potentialNextId)?.config?.joinStrategy || 'all'
									const isReady = joinStrategy === 'any'
										? [...predecessors].some(p => completedThisTurn.has(p))
										: [...predecessors].every(p => this.state.getCompletedNodes().has(p))
									if (isReady)
										this.frontier.add(potentialNextId)
								}
							}
						}
					}
				}
			}
			catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') {
					throw new CancelledWorkflowError('Workflow cancelled')
				}
				throw error
			}
		}
	}

	private async handleDynamicNodes(nodeId: string, result: NodeResult) {
		if (result.dynamicNodes && result.dynamicNodes.length > 0) {
			const gatherNodeId = result.output?.gatherNodeId
			for (const dynamicNode of result.dynamicNodes) {
				this.dynamicBlueprint.nodes.push(dynamicNode)
				this.allPredecessors.set(dynamicNode.id, new Set([nodeId]))
				if (gatherNodeId) {
					this.allPredecessors.get(gatherNodeId)?.add(dynamicNode.id)
				}
				this.frontier.add(dynamicNode.id)
			}
		}
	}

	getAllNodeIds(): Set<string> {
		return new Set(this.dynamicBlueprint.nodes.map(n => n.id))
	}

	getFallbackNodeIds(): Set<string> {
		const fallbackNodeIds = new Set<string>()
		for (const node of this.dynamicBlueprint.nodes) {
			if (node.config?.fallback)
				fallbackNodeIds.add(node.config.fallback)
		}
		return fallbackNodeIds
	}

	getDynamicBlueprint(): WorkflowBlueprint {
		return this.dynamicBlueprint
	}
}

export class FlowRuntime<TContext extends Record<string, any>, TDependencies extends Record<string, any>> {
	private registry: Record<string, NodeFunction | typeof BaseNode>
	private dependencies: TDependencies
	private eventBus: IEventBus
	private serializer: ISerializer
	private middleware: Middleware[]
	private evaluator: IEvaluator
	public options: RuntimeOptions<TDependencies>

	constructor(options: RuntimeOptions<TDependencies>) {
		this.registry = options.registry || {}
		this.dependencies = options.dependencies || ({} as TDependencies)
		this.eventBus = options.eventBus || { emit: () => { } }
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
		const contextData = typeof initialState === 'string'
			? this.serializer.deserialize(initialState) as Partial<TContext>
			: initialState
		const state = new WorkflowState<TContext>(contextData)

		try {
			await this.eventBus.emit('workflow:start', { blueprintId: blueprint.id, executionId })
			const analysis = analyzeBlueprint(blueprint)
			if (options?.strict && !analysis.isDag) {
				throw new Error(`Workflow '${blueprint.id}' failed strictness check: Cycles are not allowed.`)
			}
			if (!analysis.isDag) {
				console.warn(`Workflow '${blueprint.id}' contains cycles.`)
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
			await this.eventBus.emit('workflow:finish', { blueprintId: blueprint.id, executionId, status, errors: result.errors })
			return result
		}
		catch (error) {
			if (error instanceof DOMException ? error.name === 'AbortError' : error instanceof CancelledWorkflowError) {
				await this.eventBus.emit('workflow:finish', { blueprintId: blueprint.id, executionId, status: 'cancelled', error })
				return { context: {} as TContext, serializedContext: '{}', status: 'cancelled' }
			}
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
	): Promise<NodeResult> {
		const nodeDef = blueprint.nodes.find(n => n.id === nodeId)
		if (!nodeDef) {
			throw new NodeExecutionError(`Node '${nodeId}' not found in blueprint.`, nodeId, blueprint.id, undefined, executionId)
		}

		const contextImpl = state.getContext()
		const asyncContext: IAsyncContext<TContext> = contextImpl.type === 'sync' ? new AsyncContextView(contextImpl as ISyncContext<TContext>) : contextImpl as IAsyncContext<TContext>
		const nodeContext: NodeContext<TContext, TDependencies> = {
			context: asyncContext,
			input: await this._resolveNodeInput(nodeDef, asyncContext, allPredecessors),
			params: nodeDef.params || {},
			dependencies: this.dependencies,
			signal,
		}

		const beforeHooks = this.middleware.map(m => m.beforeNode).filter((hook): hook is NonNullable<Middleware['beforeNode']> => !!hook)
		const afterHooks = this.middleware.map(m => m.afterNode).filter((hook): hook is NonNullable<Middleware['afterNode']> => !!hook)
		const aroundHooks = this.middleware.map(m => m.aroundNode).filter((hook): hook is NonNullable<Middleware['aroundNode']> => !!hook)

		const executor = this.getExecutor(nodeDef, functionRegistry)
		const coreExecution = async (): Promise<NodeResult> => {
			let result: NodeResult | undefined
			let error: Error | undefined
			try {
				for (const hook of beforeHooks) await hook(nodeContext.context, nodeId)
				result = await this.executeWithFallback(blueprint, nodeDef, nodeContext, executor, executionId, signal, state, functionRegistry)
				return result
			}
			catch (e: any) {
				error = e
				throw e
			}
			finally {
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
			await this.eventBus.emit('node:start', { blueprintId: blueprint.id, nodeId, executionId })
			const result = await executionChain()
			await this.eventBus.emit('node:finish', { blueprintId: blueprint.id, nodeId, result, executionId })
			return result
		}
		catch (error: any) {
			await this.eventBus.emit('node:error', { blueprintId: blueprint.id, nodeId, error, executionId })
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new CancelledWorkflowError('Workflow cancelled')
			}
			throw error instanceof NodeExecutionError
				? error
				: new NodeExecutionError(`Node '${nodeId}' failed execution.`, nodeId, blueprint.id, error, executionId)
		}
	}

	private getExecutor(nodeDef: NodeDefinition, functionRegistry?: Map<string, any>): ExecutionStrategy {
		if (nodeDef.uses.startsWith('batch-') || nodeDef.uses.startsWith('loop-')) {
			return new BuiltInNodeExecutor((nodeDef, context) => this._executeBuiltInNode(nodeDef, context))
		}
		const implementation = (functionRegistry?.get(nodeDef.uses) || this.registry[nodeDef.uses])
		if (!implementation) {
			throw new FatalNodeExecutionError(`Implementation for '${nodeDef.uses}' not found for node '${nodeDef.id}'.`, nodeDef.id, '')
		}
		const maxRetries = nodeDef.config?.maxRetries ?? 1
		return isNodeClass(implementation)
			? new ClassNodeExecutor(implementation, maxRetries, this.eventBus)
			: new FunctionNodeExecutor(implementation, maxRetries, this.eventBus)
	}

	private async executeWithFallback(
		blueprint: WorkflowBlueprint,
		nodeDef: NodeDefinition,
		context: NodeContext<TContext, TDependencies>,
		executor: ExecutionStrategy,
		executionId?: string,
		signal?: AbortSignal,
		state?: WorkflowState<TContext>,
		functionRegistry?: Map<string, any>,
	): Promise<NodeResult> {
		try {
			return await executor.execute(nodeDef, context, executionId, signal)
		}
		catch (error) {
			const isFatal = error instanceof FatalNodeExecutionError
				|| (error instanceof NodeExecutionError && error.originalError instanceof FatalNodeExecutionError)
			if (isFatal)
				throw error
			const fallbackNodeId = nodeDef.config?.fallback
			if (fallbackNodeId && state) {
				await this.eventBus.emit('node:fallback', { blueprintId: blueprint.id, nodeId: nodeDef.id, executionId, fallback: fallbackNodeId })
				const fallbackNode = blueprint.nodes.find((n: NodeDefinition) => n.id === fallbackNodeId)
				if (!fallbackNode) {
					throw new NodeExecutionError(`Fallback node '${fallbackNodeId}' not found in blueprint.`, nodeDef.id, blueprint.id, undefined, executionId)
				}
				const fallbackExecutor = this.getExecutor(fallbackNode, functionRegistry)
				const fallbackResult = await fallbackExecutor.execute(fallbackNode, context, executionId, signal)
				state.markFallbackExecuted()
				return { ...fallbackResult, _fallbackExecuted: true }
			}
			throw error
		}
	}

	async determineNextNodes(
		blueprint: WorkflowBlueprint,
		nodeId: string,
		result: NodeResult,
		context: ContextImplementation<TContext>,
	): Promise<{ node: NodeDefinition, edge: EdgeDefinition }[]> {
		const outgoingEdges = blueprint.edges.filter(edge => edge.source === nodeId)
		const matched: { node: NodeDefinition, edge: EdgeDefinition }[] = []
		const evaluateEdge = async (edge: EdgeDefinition): Promise<boolean> => {
			if (!edge.condition)
				return true
			const contextData = context.type === 'sync' ? context.toJSON() : await context.toJSON()
			return !!this.evaluator.evaluate(edge.condition, { ...contextData, result })
		}
		if (result.action) {
			const actionEdges = outgoingEdges.filter(edge => edge.action === result.action)
			for (const edge of actionEdges) {
				if (await evaluateEdge(edge)) {
					const targetNode = blueprint.nodes.find(n => n.id === edge.target)
					if (targetNode)
						matched.push({ node: targetNode, edge })
				}
			}
		}
		if (matched.length === 0) {
			const defaultEdges = outgoingEdges.filter(edge => !edge.action)
			for (const edge of defaultEdges) {
				if (await evaluateEdge(edge)) {
					const targetNode = blueprint.nodes.find(n => n.id === edge.target)
					if (targetNode)
						matched.push({ node: targetNode, edge })
				}
			}
		}
		return matched
	}

	public async applyEdgeTransform(
		edge: EdgeDefinition,
		sourceResult: NodeResult,
		targetNode: NodeDefinition,
		context: ContextImplementation<TContext>,
		allPredecessors?: Map<string, Set<string>>,
	): Promise<void> {
		const asyncContext = context.type === 'sync' ? new AsyncContextView(context) : context
		const finalInput = edge.transform
			? this.evaluator.evaluate(edge.transform, { input: sourceResult.output, context: await asyncContext.toJSON() })
			: sourceResult.output
		const inputKey = `${targetNode.id}_input`
		await asyncContext.set(inputKey as any, finalInput)
		if (targetNode.config?.joinStrategy === 'any') {
			targetNode.inputs = inputKey
		}
		else if (!targetNode.inputs) {
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
			if (typeof nodeDef.inputs === 'string')
				return await context.get(nodeDef.inputs as any)
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
	): Promise<NodeResult> {
		const context = contextImpl.type === 'sync' ? new AsyncContextView(contextImpl) : contextImpl
		const { params = {}, id, inputs } = nodeDef
		switch (nodeDef.uses) {
			case 'batch-scatter': {
				const inputArray = (await context.get(inputs as any)) || []
				if (!Array.isArray(inputArray))
					throw new Error(`Input for batch-scatter node '${id}' must be an array.`)
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
			default:
				throw new FatalNodeExecutionError(`Unknown built-in node type: '${nodeDef.uses}'`, id, '')
		}
	}
}

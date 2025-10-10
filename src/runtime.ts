import type { BaseNode } from './node'
import type {
	ContextImplementation,
	EdgeDefinition,
	IAsyncContext,
	IEvaluator,
	IEventBus,
	ISerializer,
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

class NullEventBus implements IEventBus {
	emit() { }
}

export class FlowcraftRuntime<TContext extends Record<string, any>, TDependencies extends Record<string, any>> {
	private registry: Record<string, NodeFunction | typeof BaseNode>
	private dependencies: TDependencies
	private eventBus: IEventBus
	private serializer: ISerializer
	private middleware: Middleware[]
	private evaluator: IEvaluator

	constructor(options: RuntimeOptions<TDependencies>) {
		this.registry = options.registry || {}
		this.dependencies = options.dependencies || ({} as TDependencies)
		this.eventBus = options.eventBus || new NullEventBus()
		this.serializer = options.serializer || new JsonSerializer()
		this.middleware = options.middleware || []
		this.evaluator = options.evaluator || new SimpleEvaluator()
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
		const functionRegistry = options?.functionRegistry
		const signal = options?.signal

		const throwIfCancelled = () => {
			if (signal?.aborted) {
				throw new CancelledWorkflowError('Workflow execution was cancelled.', executionId)
			}
		}

		try {
			throwIfCancelled()

			const contextData = typeof initialState === 'string'
				? this.serializer.deserialize(initialState) as Partial<TContext>
				: initialState

			const context = new Context<TContext>(contextData)
			await this.eventBus.emit('workflow:start', { blueprintId: blueprint.id, executionId })

			const analysis = analyzeBlueprint(blueprint)
			if (!analysis.isDag) {
				if (options?.strict) {
					throw new Error(`Workflow '${blueprint.id}' failed strictness check: Cycles are not allowed.`)
				}
				console.warn(`Workflow '${blueprint.id}' contains cycles.`)
			}

			const dynamicBlueprint = JSON.parse(JSON.stringify(blueprint)) as WorkflowBlueprint
			const allPredecessors = new Map<string, Set<string>>()
			dynamicBlueprint.nodes.forEach(node => allPredecessors.set(node.id, new Set()))
			dynamicBlueprint.edges.forEach((edge) => {
				allPredecessors.get(edge.target)?.add(edge.source)
			})

			const completedNodes = new Set<string>()

			// Collect all nodes that are referenced as fallbacks
			const fallbackNodeIds = new Set<string>()
			for (const node of dynamicBlueprint.nodes) {
				if (node.config?.fallback) {
					fallbackNodeIds.add(node.config.fallback)
				}
			}

			// Handle case where there are no start nodes due to cycles
			let startNodes = analysis.startNodeIds
				// Exclude nodes that are only used as fallbacks
				.filter(nodeId => !fallbackNodeIds.has(nodeId))

			if (startNodes.length === 0 && analysis.cycles.length > 0 && !options?.strict) {
				// Pick the first node from each cycle to break the deadlock
				const uniqueStartNodes = new Set<string>()
				for (const cycle of analysis.cycles) {
					if (cycle.length > 0) {
						uniqueStartNodes.add(cycle[0])
					}
				}
				startNodes = Array.from(uniqueStartNodes)
			}

			const frontier = new Set<string>(startNodes)
			const allNodeIds = new Set(dynamicBlueprint.nodes.map(n => n.id))
			const errors: WorkflowError[] = []
			let anyFallbackExecuted = false

			while (frontier.size > 0) {
				throwIfCancelled()

				const currentJobs = Array.from(frontier)
				frontier.clear()

				const promises = currentJobs.map(nodeId =>
					this.executeNode(dynamicBlueprint, nodeId, context, allPredecessors, functionRegistry, executionId, signal)
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
						errors.push({ nodeId, message: error.message, originalError: error.originalError || error })
						continue
					}

					const { nodeId, result } = promiseResult.value
					completedNodes.add(nodeId)

					context.set(nodeId as any, result.output)

					completedThisTurn.add(nodeId)

					// Track if any fallback was executed
					if (result._fallbackExecuted) {
						anyFallbackExecuted = true
					}

					if (result.dynamicNodes && result.dynamicNodes.length > 0) {
						const gatherNodeId = result.output?.gatherNodeId
						for (const dynamicNode of result.dynamicNodes) {
							dynamicBlueprint.nodes.push(dynamicNode)
							allNodeIds.add(dynamicNode.id)
							allPredecessors.set(dynamicNode.id, new Set([nodeId]))
							if (gatherNodeId) {
								allPredecessors.get(gatherNodeId)?.add(dynamicNode.id)
							}
							frontier.add(dynamicNode.id)
						}
					}

					// Skip following edges if this result came from a fallback
					if (result._fallbackExecuted) {
						continue
					}

					const nextNodeCandidates = await this.determineNextNodes(dynamicBlueprint, nodeId, result, context)
					for (const { node: nextNode, edge } of nextNodeCandidates) {
						const joinStrategy = nextNode.config?.joinStrategy || 'all'

						// Allow nodes with 'any' join strategy to execute multiple times (for loops)
						if (joinStrategy !== 'any' && completedNodes.has(nextNode.id)) {
							continue
						}

						await this._applyEdgeTransform(edge, result, nextNode, context, allPredecessors)
						const requiredPredecessors = allPredecessors.get(nextNode.id)!
						const isReady = joinStrategy === 'any'
							? [...requiredPredecessors].some(p => completedThisTurn.has(p))
							: [...requiredPredecessors].every(p => completedNodes.has(p))

						if (isReady)
							frontier.add(nextNode.id)
					}

					// For dynamic nodes (which have no outgoing edges), check if any nodes
					// that list this node as a predecessor are now ready
					if (nextNodeCandidates.length === 0) {
						for (const [potentialNextId, predecessors] of allPredecessors) {
							if (predecessors.has(nodeId) && !completedNodes.has(potentialNextId)) {
								const joinStrategy = dynamicBlueprint.nodes.find(n => n.id === potentialNextId)?.config?.joinStrategy || 'all'
								const isReady = joinStrategy === 'any'
									? [...predecessors].some(p => completedThisTurn.has(p))
									: [...predecessors].every(p => completedNodes.has(p))

								if (isReady) {
									frontier.add(potentialNextId)
								}
							}
						}
					}
				}
			}

			let finalStatus: WorkflowResult['status'] = 'completed'
			if (errors.length > 0) {
				finalStatus = 'failed'
			}
			else if (completedNodes.size < allNodeIds.size) {
				// Exclude fallback-only nodes from the stall check
				const remainingNodes = [...allNodeIds].filter(id => !completedNodes.has(id) && !fallbackNodeIds.has(id))
				// If a fallback was executed, some nodes may be unreachable - don't mark as stalled
				if (remainingNodes.length > 0 && !anyFallbackExecuted) {
					console.warn(`Workflow '${blueprint.id}' finished, but some nodes were not executed (deadlock or failed branch).`, remainingNodes)
					await this.eventBus.emit('workflow:stall', { blueprintId: blueprint.id, executionId, remainingNodes })
					finalStatus = 'stalled'
				}
			}

			await this.eventBus.emit('workflow:finish', { blueprintId: blueprint.id, executionId, status: finalStatus, errors })
			const finalContextJSON = context.toJSON() as TContext
			return {
				context: finalContextJSON,
				serializedContext: this.serializer.serialize(finalContextJSON),
				status: finalStatus,
				errors: errors.length > 0 ? errors : undefined,
			}
		}
		catch (error) {
			if (error instanceof CancelledWorkflowError) {
				await this.eventBus.emit('workflow:finish', { blueprintId: blueprint.id, executionId, status: 'cancelled', error })
				return { context: {} as TContext, serializedContext: '{}', status: 'cancelled' }
			}
			throw error
		}
	}

	async executeNode(
		blueprint: WorkflowBlueprint,
		nodeId: string,
		context: ContextImplementation<TContext>,
		allPredecessors?: Map<string, Set<string>>,
		functionRegistry?: Map<string, any>,
		executionId?: string,
		signal?: AbortSignal,
	): Promise<NodeResult> {
		const nodeDef = blueprint.nodes.find(n => n.id === nodeId)
		if (!nodeDef) {
			throw new NodeExecutionError(`Node '${nodeId}' not found in blueprint.`, nodeId, blueprint.id, undefined, executionId)
		}

		const executionFn = async (def: NodeDefinition): Promise<NodeResult> => {
			return this._orchestrateNodeExecution(blueprint.id, def, context, allPredecessors, functionRegistry, executionId, signal)
		}

		const executionWithFallbackFn = async (): Promise<NodeResult> => {
			try {
				return await executionFn(nodeDef)
			}
			catch (error) {
				// Skip fallback for FatalNodeExecutionError
				// Check the error itself and any wrapped originalError
				const isFatal = error instanceof FatalNodeExecutionError
					|| (error instanceof NodeExecutionError && error.originalError instanceof FatalNodeExecutionError)

				if (isFatal) {
					throw error
				}

				const fallbackNodeId = nodeDef.config?.fallback
				if (fallbackNodeId) {
					await this.eventBus.emit('node:fallback', { blueprintId: blueprint.id, nodeId, executionId, fallback: fallbackNodeId })
					const fallbackNode = blueprint.nodes.find(n => n.id === fallbackNodeId)
					if (!fallbackNode) {
						throw new NodeExecutionError(`Fallback node '${fallbackNodeId}' not found in blueprint.`, nodeId, blueprint.id, undefined, executionId)
					}
					const fallbackNodeDef: NodeDefinition = { ...fallbackNode, config: { ...fallbackNode.config, maxRetries: fallbackNode.config?.maxRetries ?? 1 } }
					const fallbackResult = await executionFn(fallbackNodeDef)
					// Mark that this result came from a fallback so we don't follow the original node's outgoing edges
					return { ...fallbackResult, _fallbackExecuted: true }
				}
				throw error
			}
		}

		const beforeHooks = this.middleware.map(m => m.beforeNode).filter((hook): hook is NonNullable<Middleware['beforeNode']> => !!hook)
		const afterHooks = this.middleware.map(m => m.afterNode).filter((hook): hook is NonNullable<Middleware['afterNode']> => !!hook)
		const aroundHooks = this.middleware.map(m => m.aroundNode).filter((hook): hook is NonNullable<Middleware['aroundNode']> => !!hook)

		const coreExecutionFn = async (): Promise<NodeResult> => {
			let result: NodeResult | undefined
			let error: Error | undefined
			try {
				for (const hook of beforeHooks) await hook(context, nodeId)
				result = await executionWithFallbackFn()
				return result
			}
			catch (e: any) {
				error = e
				throw e
			}
			finally {
				for (const hook of afterHooks) await hook(context, nodeId, result, error)
			}
		}

		let executionChain: () => Promise<NodeResult> = coreExecutionFn
		for (let i = aroundHooks.length - 1; i >= 0; i--) {
			const hook = aroundHooks[i]
			const next = executionChain
			executionChain = () => hook(context, nodeId, next)
		}

		try {
			await this.eventBus.emit('node:start', { blueprintId: blueprint.id, nodeId, executionId })
			const result = await executionChain()
			await this.eventBus.emit('node:finish', { blueprintId: blueprint.id, nodeId, result, executionId })
			return result
		}
		catch (error: any) {
			await this.eventBus.emit('node:error', { blueprintId: blueprint.id, nodeId, error, executionId })
			const executionError = error instanceof NodeExecutionError
				? error
				: new NodeExecutionError(`Node '${nodeId}' failed execution.`, nodeId, blueprint.id, error, executionId)
			throw executionError
		}
	}

	/** Determines the next nodes to execute based on the result of the current node. */
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

	/** Applies an edge's transform expression to the data flow. */
	private async _applyEdgeTransform(
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

		// Always set the input key for this edge, even if the node has multiple predecessors
		// For nodes with 'any' join strategy (like loop start nodes), this allows the input
		// to be updated on each iteration
		const inputKey = `${targetNode.id}_input`
		await asyncContext.set(inputKey as any, finalInput)

		// Set inputs for nodes with single predecessor or 'any' join strategy
		if (targetNode.config?.joinStrategy === 'any') {
			// For 'any' join strategy, always update inputs (allows re-execution with new input)
			targetNode.inputs = inputKey
		}
		else if (!targetNode.inputs) {
			const predecessors = allPredecessors?.get(targetNode.id)
			if (!predecessors || predecessors.size === 1) {
				targetNode.inputs = inputKey
			}
		}
	}

	/** Resolves the 'inputs' mapping for a node before execution. */
	private async _resolveNodeInput(
		nodeDef: NodeDefinition,
		context: IAsyncContext<TContext>,
		allPredecessors?: Map<string, Set<string>>,
	): Promise<any> {
		// 1. Handle explicit `inputs` mapping first. This always takes precedence.
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

		// 2. If no explicit mapping, apply the default convention.
		// This runs only if the node has exactly one predecessor.
		if (allPredecessors) {
			const predecessors = allPredecessors.get(nodeDef.id)
			if (predecessors && predecessors.size === 1) {
				const singlePredecessorId = predecessors.values().next().value
				return await context.get(singlePredecessorId as any)
			}
		}

		// 3. If no explicit mapping and the convention doesn't apply, there is no input.
		return undefined
	}

	/**
	 * Orchestrates the complete, resilient execution of a single node implementation.
	 * This method correctly implements the `prep`/`exec`/`post` lifecycle,
	 * ensuring that only the `exec` phase is retried.
	 */
	private async _orchestrateNodeExecution(
		blueprintId: string,
		nodeDef: NodeDefinition,
		contextImpl: ContextImplementation<TContext>,
		allPredecessors?: Map<string, Set<string>>,
		functionRegistry?: Map<string, any>,
		executionId?: string,
		signal?: AbortSignal,
	): Promise<NodeResult> {
		signal?.throwIfAborted()

		// --- Built-in Node Logic ---
		if (nodeDef.uses.startsWith('batch-') || nodeDef.uses.startsWith('loop-')) {
			return this._executeBuiltInNode(nodeDef, contextImpl)
		}

		const implementation = (functionRegistry?.get(nodeDef.uses) || this.registry[nodeDef.uses])
		if (!implementation) {
			throw new FatalNodeExecutionError(`Implementation for '${nodeDef.uses}' not found for node '${nodeDef.id}'.`, nodeDef.id, blueprintId, undefined, executionId)
		}

		const nodeApiContext = contextImpl.type === 'sync' ? new AsyncContextView(contextImpl) : contextImpl
		const nodeContext: NodeContext<TContext, TDependencies> = {
			context: nodeApiContext,
			input: await this._resolveNodeInput(nodeDef, nodeApiContext, allPredecessors),
			params: nodeDef.params || {},
			dependencies: this.dependencies,
			signal,
		}

		const maxRetries = nodeDef.config?.maxRetries ?? 1
		let lastError: any

		if (!isNodeClass(implementation)) {
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					return await implementation(nodeContext)
				}
				catch (error) {
					lastError = error
					if (error instanceof FatalNodeExecutionError)
						break
					if (attempt < maxRetries) {
						await this.eventBus.emit('node:retry', { blueprintId, nodeId: nodeDef.id, attempt, error, executionId })
					}
				}
			}
			throw lastError
		}

		const instance = new implementation(nodeDef.params) // eslint-disable-line new-cap
		const prepResult = await instance.prep(nodeContext)
		let execResult: Omit<NodeResult, 'error'>

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				execResult = await instance.exec(prepResult, nodeContext)
				lastError = undefined
				break
			}
			catch (error) {
				lastError = error
				if (error instanceof FatalNodeExecutionError)
					break
				if (attempt < maxRetries) {
					await this.eventBus.emit('node:retry', { blueprintId, nodeId: nodeDef.id, attempt, error, executionId })
				}
			}
		}

		if (lastError) {
			execResult = await instance.fallback(lastError, nodeContext)
		}

		return await instance.post(execResult!, nodeContext)
	}

	private async _executeBuiltInNode(
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
				// This node is primarily a synchronization point. The orchestrator's join logic
				// does the heavy lifting. It can be extended to aggregate results in the future.
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

import type { BaseNode } from './node'
import type { ContextImplementation, EdgeDefinition, IAsyncContext, IConditionEvaluator, IEventBus, ISerializer, Middleware, NodeClass, NodeContext, NodeDefinition, NodeFunction, NodeImplementation, NodeResult, RuntimeOptions, WorkflowBlueprint } from './types'
import { analyzeBlueprint } from './analysis'
import { AsyncContextView, Context } from './context'
import { FatalNodeExecutionError, NodeExecutionError } from './errors'
import { JsonSerializer } from './serializer'

/** A type guard to reliably distinguish a NodeClass from a NodeFunction. */
function isNodeClass(impl: NodeImplementation): impl is NodeClass {
	return typeof impl === 'function' && !!impl.prototype?.exec
}

class NullEventBus implements IEventBus {
	emit() { }
}

export class FlowcraftRuntime<TContext extends Record<string, any>, TDependencies extends Record<string, any>> {
	private registry: Record<string, NodeFunction | typeof BaseNode>
	private dependencies: TDependencies
	private eventBus: IEventBus
	private serializer: ISerializer
	private middleware: Middleware[]
	private conditionEvaluator?: IConditionEvaluator

	constructor(options: RuntimeOptions<TDependencies>) {
		this.registry = options.registry || {}
		this.dependencies = options.dependencies || ({} as TDependencies)
		this.eventBus = options.eventBus || new NullEventBus()
		this.serializer = options.serializer || new JsonSerializer()
		this.middleware = options.middleware || []
		this.conditionEvaluator = options.conditionEvaluator
	}

	/** Mode 1: Acts as a local orchestrator to run a full blueprint. */
	async run(
		blueprint: WorkflowBlueprint,
		initialState: Partial<TContext> | string = {},
		options?: {
			functionRegistry?: Map<string, any>
			strict?: boolean
		},
	): Promise<any> {
		const executionId = globalThis.crypto?.randomUUID()
		const functionRegistry = options?.functionRegistry

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
			console.warn(`Workflow '${blueprint.id}' contains cycles, which may lead to infinite loops if not handled correctly by edge conditions.`)
		}

		const allPredecessors = new Map<string, Set<string>>()
		blueprint.nodes.forEach(node => allPredecessors.set(node.id, new Set()))
		blueprint.edges.forEach((edge) => {
			allPredecessors.get(edge.target)?.add(edge.source)
		})

		const completedNodes = new Set<string>()
		const frontier = new Set<string>(analysis.startNodeIds)
		const allNodeIds = new Set(blueprint.nodes.map(n => n.id))
		let executionHasFailed = false

		while (frontier.size > 0) {
			const currentJobs = Array.from(frontier)
			frontier.clear()

			const promises = currentJobs.map(nodeId =>
				this.executeNode(blueprint, nodeId, context, functionRegistry, executionId)
					.then(result => ({ status: 'fulfilled' as const, value: { nodeId, result } }))
					.catch(error => ({ status: 'rejected' as const, reason: { nodeId, error } })),
			)

			const settledResults = await Promise.all(promises)
			const completedThisTurn = new Set<string>()

			for (const promiseResult of settledResults) {
				if (promiseResult.status === 'rejected') {
					executionHasFailed = true
					const { nodeId, error } = promiseResult.reason
					console.error(`Path halted at node '${nodeId}' due to error:`, error.originalError || error)
					// Do not add successors for failed nodes.
					continue
				}

				const { nodeId, result } = promiseResult.value
				completedNodes.add(nodeId)
				completedThisTurn.add(nodeId) // Track nodes completed in the current iteration

				const nextNodes = await this.determineNextNodes(blueprint, nodeId, result, context)

				for (const nextNode of nextNodes) {
					if (completedNodes.has(nextNode.id))
						continue // Already processed

					const requiredPredecessors = allPredecessors.get(nextNode.id)!
					const joinStrategy = nextNode.config?.joinStrategy || 'all'

					let isReady = false
					if (joinStrategy === 'any') {
						// Ready if ANY predecessor has just completed. This enables loops and conditional merges.
						isReady = [...requiredPredecessors].some(p => completedThisTurn.has(p))
					}
					else { // Default 'all' strategy
						// Ready if ALL predecessors have completed over the workflow's lifetime.
						isReady = [...requiredPredecessors].every(p => completedNodes.has(p))
					}

					if (isReady) {
						frontier.add(nextNode.id)
					}
				}
			}
		}

		if (completedNodes.size < allNodeIds.size && !executionHasFailed) {
			const remainingNodes = [...allNodeIds].filter(id => !completedNodes.has(id))
			console.warn(`Workflow '${blueprint.id}' finished, but some nodes were not executed (deadlock or failed branch).`, remainingNodes)
			await this.eventBus.emit('workflow:stall', { blueprintId: blueprint.id, executionId, remainingNodes })
		}

		await this.eventBus.emit('workflow:finish', { blueprintId: blueprint.id, executionId, status: executionHasFailed ? 'failed' : 'completed' })

		const finalContextJSON = context.toJSON()
		return {
			context: finalContextJSON,
			serializedContext: this.serializer.serialize(finalContextJSON),
		}
	}

	/** Mode 2: Acts as a distributed worker to execute a single node. */
	async executeNode(blueprint: WorkflowBlueprint, nodeId: string, context: ContextImplementation<TContext>, functionRegistry?: Map<string, any>, executionId?: string): Promise<NodeResult> {
		const nodeDef = blueprint.nodes.find(n => n.id === nodeId)
		if (!nodeDef) {
			throw new NodeExecutionError(`Node '${nodeId}' not found in blueprint.`, nodeId, blueprint.id, undefined, executionId)
		}

		const implementation = (functionRegistry?.get(nodeDef.uses) || this.registry[nodeDef.uses])
		if (!implementation) {
			throw new NodeExecutionError(`Implementation for '${nodeDef.uses}' not found for node '${nodeId}'.`, nodeId, blueprint.id, undefined, executionId)
		}

		const isClassBased = isNodeClass(implementation)
		const singleExecutionAttempt = () => this._executeNodeLogic(blueprint.id, nodeDef, context, functionRegistry, executionId)

		const resilientExecutionFn = async (): Promise<NodeResult> => {
			// If it's a class, its internal logic in _executeNodeLogic already handles the prep/exec/post
			// lifecycle and retries ONLY the exec part. The wrapper's job is to call it once.
			if (isClassBased) {
				return singleExecutionAttempt()
			}

			// For simple functions, this wrapper provides the resiliency.
			const maxRetries = nodeDef.config?.maxRetries ?? 1
			let lastError: any
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					return await singleExecutionAttempt()
				}
				catch (error) {
					lastError = error
					if (error instanceof FatalNodeExecutionError)
						break
					if (attempt < maxRetries) {
						await this.eventBus.emit('node:retry', { blueprintId: blueprint.id, nodeId, attempt, error, executionId })
					}
				}
			}

			if (nodeDef.config?.fallback) {
				await this.eventBus.emit('node:fallback', { blueprintId: blueprint.id, nodeId, executionId, fallback: nodeDef.config.fallback })
				const fallbackNodeDef: NodeDefinition = { ...nodeDef, uses: nodeDef.config.fallback, config: { maxRetries: 1 } }
				return this._executeNodeLogic(blueprint.id, fallbackNodeDef, context, functionRegistry, executionId)
			}

			throw lastError // Re-throw final error if no fallback
		}

		const beforeHooks = this.middleware.map(m => m.beforeNode).filter((hook): hook is NonNullable<Middleware['beforeNode']> => !!hook)
		const afterHooks = this.middleware.map(m => m.afterNode).filter((hook): hook is NonNullable<Middleware['afterNode']> => !!hook)
		const aroundHooks = this.middleware.map(m => m.aroundNode).filter((hook): hook is NonNullable<Middleware['aroundNode']> => !!hook)

		const coreExecutionFn = async (): Promise<NodeResult> => {
			let result: NodeResult | undefined
			let error: Error | undefined
			try {
				for (const hook of beforeHooks) await hook(context, nodeId)
				result = await resilientExecutionFn()
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
			if (error instanceof Error) {
				throw new NodeExecutionError(`Node '${nodeId}' failed execution.`, nodeId, blueprint.id, error, executionId)
			}
			throw new NodeExecutionError(`Node '${nodeId}' failed with an unknown error.`, nodeId, blueprint.id, undefined, executionId)
		}
	}

	/** Determines the next nodes to execute based on the result of the current node. */
	async determineNextNodes(blueprint: WorkflowBlueprint, nodeId: string, result: NodeResult, context: ContextImplementation<TContext>): Promise<NodeDefinition[]> {
		const outgoingEdges = blueprint.edges.filter(edge => edge.source === nodeId)
		const matchedNodes: NodeDefinition[] = []

		const evaluateEdge = async (edge: EdgeDefinition): Promise<boolean> => {
			let conditionMatch = true
			if (edge.condition) {
				if (!this.conditionEvaluator) {
					console.warn(`Edge has condition '${edge.condition}' but no condition evaluator is configured. Skipping.`)
					conditionMatch = false
				}
				else {
					const contextData = context.type === 'sync' ? context.toJSON() : await context.toJSON()
					conditionMatch = await this.conditionEvaluator.evaluate(edge.condition, { ...contextData, result })
				}
			}
			return conditionMatch
		}

		// Pass 1: Look for edges that match the specific action from the result.
		if (result.action) {
			const actionSpecificEdges = outgoingEdges.filter(edge => edge.action === result.action)
			for (const edge of actionSpecificEdges) {
				if (await evaluateEdge(edge)) {
					const targetNode = blueprint.nodes.find(n => n.id === edge.target)
					if (targetNode)
						matchedNodes.push(targetNode)
				}
			}
		}

		// Pass 2: If no action-specific edges were taken, check for "default" edges (no action).
		if (matchedNodes.length === 0) {
			const defaultEdges = outgoingEdges.filter(edge => !edge.action)
			for (const edge of defaultEdges) {
				if (await evaluateEdge(edge)) {
					const targetNode = blueprint.nodes.find(n => n.id === edge.target)
					if (targetNode)
						matchedNodes.push(targetNode)
				}
			}
		}

		return matchedNodes
	}

	/** Resolves the 'inputs' mapping for a node before execution. */
	private async _resolveNodeInput(nodeDef: NodeDefinition, context: IAsyncContext<TContext>): Promise<any> {
		if (!nodeDef.inputs)
			return undefined
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
		return undefined
	}

	/** The internal logic that resolves and runs a SINGLE ATTEMPT of the node's implementation. */
	private async _executeNodeLogic(blueprintId: string, nodeDef: NodeDefinition, contextImpl: ContextImplementation<TContext>, functionRegistry?: Map<string, any>, executionId?: string): Promise<NodeResult> {
		const implementation = (functionRegistry?.get(nodeDef.uses) || this.registry[nodeDef.uses])
		if (!implementation)
			throw new Error(`Implementation for '${nodeDef.uses}' not found.`)

		const nodeApiContext = contextImpl.type === 'sync' ? new AsyncContextView(contextImpl) : contextImpl

		const nodeContext: NodeContext<TContext, TDependencies> = {
			context: nodeApiContext,
			input: await this._resolveNodeInput(nodeDef, nodeApiContext),
			params: nodeDef.params || {},
			dependencies: this.dependencies,
		}

		if (isNodeClass(implementation)) {
			const instance = new implementation(nodeDef.params) // eslint-disable-line new-cap

			const prepResult = await instance.prep(nodeContext)

			const maxRetries = nodeDef.config?.maxRetries ?? 1
			let execResult: Omit<NodeResult, 'error'> | undefined
			let lastError: any

			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					execResult = await instance.exec(prepResult, nodeContext)
					lastError = undefined
					break
				}
				catch (error) {
					lastError = error
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
		else {
			// For simple functions, this method correctly performs just a single attempt.
			// The calling `executeNode` method provides the resiliency wrapper.
			return await implementation(nodeContext)
		}
	}
}

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

		// Pre-process to get all predecessors for each node to handle fan-in correctly.
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
			frontier.clear() // Consume the current frontier

			const promises = currentJobs.map(nodeId =>
				this.executeNode(blueprint, nodeId, context, functionRegistry, executionId)
					.then(result => ({ status: 'fulfilled' as const, value: { nodeId, result } }))
					.catch(error => ({ status: 'rejected' as const, reason: { nodeId, error } })),
			)

			const settledResults = await Promise.all(promises)

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

				const nextNodes = await this.determineNextNodes(blueprint, nodeId, result, context)

				for (const nextNode of nextNodes) {
					if (completedNodes.has(nextNode.id))
						continue // Already processed

					const requiredPredecessors = allPredecessors.get(nextNode.id)!
					const areAllPredecessorsDone = [...requiredPredecessors].every(p => completedNodes.has(p))

					if (areAllPredecessorsDone) {
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

		// The single attempt function that will be wrapped by resiliency and middleware.
		const singleExecutionAttempt = () => this._executeNodeLogic(
			blueprint.id,
			nodeDef,
			context,
			functionRegistry,
			executionId,
		)

		const resilientExecutionFn = async (): Promise<NodeResult> => {
			// For class-based nodes, resiliency (retry/fallback) is handled inside _executeNodeLogic's exec loop.
			// For function-based nodes, this wrapper provides the resiliency.
			const maxRetries = isClassBased ? 1 : (nodeDef.config?.maxRetries ?? 1)
			let lastError: any

			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					return await singleExecutionAttempt()
				}
				catch (error) {
					lastError = error
					// Abort retries for fatal errors
					if (error instanceof FatalNodeExecutionError) {
						break
					}
					// For class-based nodes, the internal logic emits its own more granular retry events.
					if (!isClassBased && attempt < maxRetries) {
						await this.eventBus.emit('node:retry', { blueprintId: blueprint.id, nodeId, attempt, error, executionId })
					}
				}
			}

			// All retries failed. The fallback logic here only applies to function-based nodes,
			// as BaseNode has its own internal `fallback()` method handled in _executeNodeLogic.
			if (!isClassBased && nodeDef.config?.fallback) {
				await this.eventBus.emit('node:fallback', { blueprintId: blueprint.id, nodeId, executionId, fallback: nodeDef.config.fallback })
				const fallbackNodeDef: NodeDefinition = { ...nodeDef, uses: nodeDef.config.fallback, config: { maxRetries: 1 } } // Prevent fallback loops
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
					if (targetNode) {
						matchedNodes.push(targetNode)
					}
				}
			}
		}

		// Pass 2: If no action-specific edges were taken, check for "default" edges (no action).
		if (matchedNodes.length === 0) {
			const defaultEdges = outgoingEdges.filter(edge => !edge.action)
			for (const edge of defaultEdges) {
				if (await evaluateEdge(edge)) {
					const targetNode = blueprint.nodes.find(n => n.id === edge.target)
					if (targetNode) {
						matchedNodes.push(targetNode)
					}
				}
			}
		}

		return matchedNodes
	}

	/** Resolves the 'inputs' mapping for a node before execution. */
	private async _resolveNodeInput(nodeDef: NodeDefinition, context: IAsyncContext<TContext>): Promise<any> {
		if (!nodeDef.inputs) {
			return undefined
		}
		// Case 1: 'inputs' is a string key for a single context value.
		if (typeof nodeDef.inputs === 'string') {
			return await context.get(nodeDef.inputs as any)
		}
		// Case 2: 'inputs' is a record mapping input names to context keys.
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
		if (!implementation) {
			// This check is redundant due to the check in executeNode, but good for safety.
			throw new Error(`Implementation for '${nodeDef.uses}' not found.`)
		}

		const nodeApiContext = contextImpl.type === 'sync' ? new AsyncContextView(contextImpl) : contextImpl

		const nodeContext: NodeContext<TContext, TDependencies> = {
			context: nodeApiContext,
			input: await this._resolveNodeInput(nodeDef, nodeApiContext),
			params: nodeDef.params || {},
			dependencies: this.dependencies,
		}

		if (isNodeClass(implementation)) {
			const instance = new implementation(nodeDef.params) // eslint-disable-line new-cap

			// Phase 1: prep() runs ONCE.
			const prepResult = await instance.prep(nodeContext)

			// Phase 2: The retry/fallback logic for the core `exec` method.
			const maxRetries = nodeDef.config?.maxRetries ?? 1
			let execResult: Omit<NodeResult, 'error'> | undefined
			let lastError: any

			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					execResult = await instance.exec(prepResult, nodeContext)
					lastError = undefined // Clear error on success
					break // Exit loop on success
				}
				catch (error) {
					lastError = error
					if (attempt < maxRetries) {
						await this.eventBus.emit('node:retry', { blueprintId, nodeId: nodeDef.id, attempt, error, executionId })
					}
				}
			}

			if (lastError) {
				// All retries failed, try the instance's own fallback method.
				execResult = await instance.fallback(lastError, nodeContext)
			}

			// Phase 3: post() runs ONCE after a successful exec or fallback.
			return await instance.post(execResult!, nodeContext)
		}
		else {
			// For simple functions, resiliency is handled by the calling `executeNode` method.
			// This method just performs a single attempt.
			return await implementation(nodeContext)
		}
	}
}

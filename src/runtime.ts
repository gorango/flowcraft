import type { BaseNode } from './node'
import type {
	ContextImplementation,
	EdgeDefinition,
	IAsyncContext,
	IEvaluator,
	IEventBus,
	ISerializer,
	Middleware,
	NodeClass,
	NodeContext,
	NodeDefinition,
	NodeFunction,
	NodeImplementation,
	NodeResult,
	RuntimeOptions,
	WorkflowBlueprint,
	WorkflowError,
	WorkflowResult,
} from './types'
import { analyzeBlueprint } from './analysis'
import { AsyncContextView, Context } from './context'
import { FatalNodeExecutionError, NodeExecutionError } from './errors'
import { SimpleEvaluator } from './evaluator'
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
	private evaluator: IEvaluator

	constructor(options: RuntimeOptions<TDependencies>) {
		this.registry = options.registry || {}
		this.dependencies = options.dependencies || ({} as TDependencies)
		this.eventBus = options.eventBus || new NullEventBus()
		this.serializer = options.serializer || new JsonSerializer()
		this.middleware = options.middleware || []
		this.evaluator = options.evaluator || new SimpleEvaluator()
	}

	/** Mode 1: Acts as a local orchestrator to run a full blueprint. */
	async run(
		blueprint: WorkflowBlueprint,
		initialState: Partial<TContext> | string = {},
		options?: {
			functionRegistry?: Map<string, any>
			strict?: boolean
		},
	): Promise<WorkflowResult<TContext>> {
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
		const errors: WorkflowError[] = []

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
					const { nodeId, error } = promiseResult.reason
					errors.push({
						nodeId,
						message: error.message,
						originalError: error.originalError || error,
					})
					console.error(`Path halted at node '${nodeId}' due to error:`, error.originalError || error)
					continue
				}

				const { nodeId, result } = promiseResult.value
				completedNodes.add(nodeId)
				completedThisTurn.add(nodeId)

				const nextNodeCandidates = await this.determineNextNodes(blueprint, nodeId, result, context)

				for (const { node: nextNode, edge } of nextNodeCandidates) {
					if (completedNodes.has(nextNode.id))
						continue

					// Phase 3 Change: Apply edge transform before checking join readiness
					await this._applyEdgeTransform(edge, result, nextNode, context)

					const requiredPredecessors = allPredecessors.get(nextNode.id)!
					const joinStrategy = nextNode.config?.joinStrategy || 'all'

					let isReady = false
					if (joinStrategy === 'any') {
						isReady = [...requiredPredecessors].some(p => completedThisTurn.has(p))
					}
					else {
						isReady = [...requiredPredecessors].every(p => completedNodes.has(p))
					}

					if (isReady) {
						frontier.add(nextNode.id)
					}
				}
			}
		}

		let finalStatus: WorkflowResult['status'] = 'completed'
		if (errors.length > 0) {
			finalStatus = 'failed'
		}
		else if (completedNodes.size < allNodeIds.size) {
			const remainingNodes = [...allNodeIds].filter(id => !completedNodes.has(id))
			console.warn(`Workflow '${blueprint.id}' finished, but some nodes were not executed (deadlock or failed branch).`, remainingNodes)
			await this.eventBus.emit('workflow:stall', { blueprintId: blueprint.id, executionId, remainingNodes })
			finalStatus = 'stalled'
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

	/** Mode 2: Acts as a distributed worker to execute a single node. */
	async executeNode(blueprint: WorkflowBlueprint, nodeId: string, context: ContextImplementation<TContext>, functionRegistry?: Map<string, any>, executionId?: string): Promise<NodeResult> {
		const nodeDef = blueprint.nodes.find(n => n.id === nodeId)
		if (!nodeDef) {
			throw new NodeExecutionError(`Node '${nodeId}' not found in blueprint.`, nodeId, blueprint.id, undefined, executionId)
		}

		const resilientExecutionFn = async (): Promise<NodeResult> => {
			const maxRetries = nodeDef.config?.maxRetries ?? 1
			let lastError: any

			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					return await this._executeNodeLogic(blueprint.id, nodeDef, context, functionRegistry, executionId)
				}
				catch (error) {
					lastError = error
					if (error instanceof FatalNodeExecutionError) {
						break
					}
					if (attempt < maxRetries) {
						await this.eventBus.emit('node:retry', { blueprintId: blueprint.id, nodeId, attempt, error, executionId })
						// NOTE: In a real implementation, a `retryDelay` from nodeDef.config would be awaited here.
					}
				}
			}

			if (nodeDef.config?.fallback) {
				await this.eventBus.emit('node:fallback', { blueprintId: blueprint.id, nodeId, executionId, fallback: nodeDef.config.fallback })
				const fallbackNodeDef: NodeDefinition = { ...nodeDef, uses: nodeDef.config.fallback, config: { maxRetries: 1 } }
				return this._executeNodeLogic(blueprint.id, fallbackNodeDef, context, functionRegistry, executionId)
			}

			throw lastError
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
			const executionError = error instanceof NodeExecutionError
				? error
				: new NodeExecutionError(`Node '${nodeId}' failed execution.`, nodeId, blueprint.id, error, executionId)
			throw executionError
		}
	}

	/** Determines the next nodes to execute based on the result of the current node. */
	async determineNextNodes(blueprint: WorkflowBlueprint, nodeId: string, result: NodeResult, context: ContextImplementation<TContext>): Promise<{ node: NodeDefinition, edge: EdgeDefinition }[]> {
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
	private async _applyEdgeTransform(edge: EdgeDefinition, sourceResult: NodeResult, targetNode: NodeDefinition, context: ContextImplementation<TContext>): Promise<void> {
		const asyncContext = context.type === 'sync' ? new AsyncContextView(context) : context

		const finalInput = edge.transform
			? this.evaluator.evaluate(edge.transform, {
					input: sourceResult.output,
					context: await asyncContext.toJSON(),
				})
			: sourceResult.output

		if (!targetNode.inputs) {
			const inputKey = `${targetNode.id}_input`
			await asyncContext.set(inputKey as any, finalInput)

			// Mutate the node definition in memory for this run to add the mapping.
			// NOTE: This is a simplification; a more robust approach might pass inputs separately.
			targetNode.inputs = inputKey
		}
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
		if (nodeDef.uses === 'batch-scatter' || nodeDef.uses === 'batch-gather') {
			console.log(`[Runtime] Executing built-in: ${nodeDef.uses} for node ${nodeDef.id}`)
			if (nodeDef.uses === 'batch-scatter') {
				// Placeholder logic
				return { output: { status: 'scattered', count: 0 } }
			}
			if (nodeDef.uses === 'batch-gather') {
				// Placeholder logic
				return { output: [] }
			}
		}

		const implementation = (functionRegistry?.get(nodeDef.uses) || this.registry[nodeDef.uses])
		if (!implementation) {
			throw new FatalNodeExecutionError(`Implementation for '${nodeDef.uses}' not found for node '${nodeDef.id}'.`, nodeDef.id, blueprintId, undefined, executionId)
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

			const prepResult = await instance.prep(nodeContext)

			let execResult: Omit<NodeResult, 'error'>
			try {
				execResult = await instance.exec(prepResult, nodeContext)
			}
			catch (error: any) {
				execResult = await instance.fallback(error, nodeContext)
			}

			return await instance.post(execResult, nodeContext)
		}
		else {
			return await implementation(nodeContext)
		}
	}
}

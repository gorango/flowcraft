import type { Context } from './context'
import type {
	EdgeDefinition,
	ExecutionMetadata,
	IConditionEvaluator,
	IContext,
	IEventBus,
	ISerializer,
	Middleware,
	NodeContext,
	NodeDefinition,
	NodeMap,
	NodeRegistry,
	NodeResult,
	RuntimeDependencies,
	RuntimeOptions,
	WorkflowBlueprint,
	WorkflowResult,
} from './types'
import { randomUUID } from 'node:crypto'
import { createAsyncContext, createContext } from './context'
import { CancelledWorkflowError, FatalNodeExecutionError, NodeExecutionError } from './errors'

/**
 * Simple semaphore for controlling concurrency
 */
class Semaphore {
	private permits: number
	private waiting: Array<() => void> = []

	constructor(permits: number) {
		this.permits = permits
	}

	async acquire<T>(fn: () => Promise<T>): Promise<T> {
		if (this.permits > 0) {
			this.permits--
			try {
				return await fn()
			}
			finally {
				this.release()
			}
		}

		return new Promise((resolve, reject) => {
			this.waiting.push(async () => {
				try {
					this.permits--
					const result = await fn()
					resolve(result)
				}
				catch (error) {
					reject(error)
				}
				finally {
					this.release()
				}
			})
		})
	}

	private release(): void {
		this.permits++
		if (this.waiting.length > 0) {
			const next = this.waiting.shift()!
			next()
		}
	}
}

/** A default event bus that does nothing, ensuring the framework is silent by default. */
class NullEventBus implements IEventBus {
	emit() { /* no-op */ }
}

/** A default serializer using standard JSON. */
class JsonSerializer implements ISerializer {
	serialize(data: Record<string, any>): string {
		return JSON.stringify(data)
	}

	deserialize(text: string): Record<string, any> {
		return JSON.parse(text)
	}
}

/**
 * A simple, safe, dependency-free evaluator for basic conditions.
 * Handles property access and common comparisons.
 */
class DefaultConditionEvaluator implements IConditionEvaluator {
	private parseCondition(condition: string): { leftPath: string, operator: string, rightStr: string } | null {
		condition = condition.trim()
		const operatorPattern = /(!==|===|<=|>=|==|!=|[<>=])/
		const match = condition.match(operatorPattern)

		if (!match)
			return null

		const operator = match[1]
		const index = match.index!

		if (index === 0)
			return null // Operator at start is invalid

		const leftPath = condition.substring(0, index).trim()
		const rightStr = condition.substring(index + operator.length).trim()

		return { leftPath, operator, rightStr }
	}

	evaluate(condition: string, context: Record<string, any>): boolean {
		const parsed = this.parseCondition(condition)
		if (!parsed) {
			// fallback for simple truthy checks like "result.isAdmin"
			return !!this.resolvePath(condition.trim(), context)
		}

		const { leftPath, operator, rightStr } = parsed
		const leftVal = this.resolvePath(leftPath.trim(), context)
		const rightVal = this.parseValue(rightStr.trim())

		switch (operator) {
			case '==':
			case '===':
				return leftVal === rightVal
			case '!=':
			case '!==':
				return leftVal !== rightVal
			case '>':
				return leftVal > rightVal
			case '<':
				return leftVal < rightVal
			case '>=':
				return leftVal >= rightVal
			case '<=':
				return leftVal <= rightVal
			default:
				return false
		}
	}

	private resolvePath(path: string, context: Record<string, any>): any {
		return path.split('.').reduce((acc, part) => acc && acc[part], context)
	}

	private parseValue(str: string): any {
		if (str === 'true')
			return true
		if (str === 'false')
			return false
		if (str === 'null')
			return null
		if (str === 'undefined')
			return undefined
		if (!isNaN(Number(str)) && !isNaN(Number.parseFloat(str))) // eslint-disable-line unicorn/prefer-number-properties
			return Number(str)
		// handle strings like "'admin'" or '"admin"'
		if ((str.startsWith('\'') && str.endsWith('\'')) || (str.startsWith('"') && str.endsWith('"')))
			return str.slice(1, -1)

		return str
	}
}

/**
 * Handles compilation, caching, and execution of workflow blueprints
 */
export class FlowcraftRuntime<TContext extends Record<string, any> = Record<string, any>, TNodeMap extends NodeMap = NodeMap> {
	private registry: NodeRegistry
	private dependencies: RuntimeDependencies
	private defaultNodeConfig: any
	private environment: 'development' | 'staging' | 'production'
	private compiledFlows: Map<string, ExecutableFlow<TContext>>
	private blueprintCache: Map<string, WorkflowBlueprint<TNodeMap>>
	private eventBus: IEventBus
	private conditionEvaluator: IConditionEvaluator
	private serializer: ISerializer
	private middleware: Middleware<TContext>[]

	constructor(options: RuntimeOptions) {
		this.registry = options.registry
		this.dependencies = options.dependencies || {}
		this.defaultNodeConfig = options.defaultNodeConfig || {}
		this.environment = options.environment || 'development'
		this.eventBus = options.eventBus || new NullEventBus()
		this.conditionEvaluator = options.conditionEvaluator || new DefaultConditionEvaluator()
		this.serializer = options.serializer || new JsonSerializer()
		this.middleware = (options.middleware || []) as Middleware<TContext>[]
		this.compiledFlows = new Map()
		this.blueprintCache = new Map()
	}

	/**
	 * Run a workflow blueprint
	 */
	async run(
		blueprint: WorkflowBlueprint<TNodeMap>,
		initialContext: Partial<TContext> = {},
		functionRegistry?: Map<string, any>,
		signal?: AbortSignal,
	): Promise<WorkflowResult<TContext>> {
		const startTime = new Date()
		const executionId = randomUUID()
		let finalContext: Context<TContext> | undefined
		let status: 'completed' | 'failed' | 'cancelled' = 'completed'
		let finalError: NodeExecutionError | CancelledWorkflowError | undefined

		if (signal?.aborted) {
			const err = new CancelledWorkflowError('Workflow cancelled before execution could start.', executionId)
			// even though we throw, we still want to emit the lifecycle events.
			status = 'cancelled'
			finalError = err
		}
		else {
			await this.eventBus.emit('workflow:start', {
				executionId,
				blueprintId: blueprint.id,
				initialContext,
			})

			try {
				const executableFlow = await this.getOrCompileFlow(blueprint, functionRegistry)
				const metadata: ExecutionMetadata = {
					executionId,
					blueprintId: blueprint.id,
					currentNodeId: '',
					startedAt: startTime,
					environment: this.environment,
					signal,
				}
				const context = createContext<TContext>(initialContext, metadata) as Context<TContext>
				finalContext = await executableFlow.execute(context)
			}
			catch (error) {
				if (error instanceof CancelledWorkflowError) {
					status = 'cancelled'
					finalError = error
				}
				else {
					status = 'failed'
					finalError = error instanceof NodeExecutionError
						? error
						: new NodeExecutionError(
							error instanceof Error ? error.message : 'Unknown workflow error',
							'workflow_runtime',
							blueprint.id,
							executionId,
							error instanceof Error ? error : undefined,
						)
				}
			}
		}

		const endTime = new Date()
		const result: WorkflowResult<TContext> = {
			context: ((await finalContext?.toJSON()) ?? initialContext) as TContext,
			metadata: {
				executionId,
				blueprintId: blueprint.id,
				startedAt: startTime,
				completedAt: endTime,
				duration: endTime.getTime() - startTime.getTime(),
				status,
				error: finalError
					/* eslint-disable style/indent */
					? {
						nodeId: finalError instanceof NodeExecutionError ? finalError.nodeId : 'workflow_runtime',
						message: finalError.message,
						details: finalError,
					}
					/* eslint-enable style/indent */
					: undefined,
			},
		}

		await this.eventBus.emit('workflow:finish', result)

		if (finalError)
			throw finalError

		return result
	}

	/**
	 * Get a compiled flow from cache or compile it
	 */
	private async getOrCompileFlow(blueprint: WorkflowBlueprint<TNodeMap>, functionRegistry?: Map<string, any>): Promise<ExecutableFlow<TContext>> {
		// if a function registry is provided, it might contain different implementations,
		// so we bypass the cache to ensure we compile with the correct functions.
		const cached = !functionRegistry && this.compiledFlows.get(blueprint.id)
		if (cached)
			return cached

		const compiled = await this.compileBlueprint(blueprint, functionRegistry)

		// cache only if no special function registry was provided
		if (!functionRegistry) {
			this.compiledFlows.set(blueprint.id, compiled)
		}

		return compiled
	}

	/**
	 * Compile a blueprint into an executable flow
	 */
	private async compileBlueprint(blueprint: WorkflowBlueprint<TNodeMap>, functionRegistry: Map<string, any> = new Map()): Promise<ExecutableFlow<TContext>> {
		// create a map of nodes by ID for quick lookup
		const nodeMap = new Map<string, CompiledNode>()

		// first pass: create compiled nodes
		for (const nodeDef of blueprint.nodes) {
			const implementation = this.findNodeImplementation(nodeDef, functionRegistry)
			const fallbackImplementation = nodeDef.config?.fallback
				? this.findNodeImplementation({ id: nodeDef.id, uses: nodeDef.config.fallback }, functionRegistry)
				: undefined

			const compiledNode: CompiledNode = {
				id: nodeDef.id,
				implementation,
				fallbackImplementation,
				params: nodeDef.params || {},
				config: { ...this.defaultNodeConfig, ...nodeDef.config },
				predecessorIds: new Set(), // will be populated next
				nextNodes: [],
			}
			nodeMap.set(nodeDef.id, compiledNode)
		}

		// second pass: wire up the edges and predecessors
		for (const edgeDef of blueprint.edges) {
			const sourceNode = nodeMap.get(edgeDef.source)
			const targetNode = nodeMap.get(edgeDef.target)

			if (!sourceNode) {
				throw new Error(`Source node '${edgeDef.source}' not found`)
			}
			if (!targetNode) {
				throw new Error(`Target node '${edgeDef.target}' not found`)
			}

			// add the target to the source's next nodes
			sourceNode.nextNodes.push({
				node: targetNode,
				action: edgeDef.action,
				condition: edgeDef.condition,
				transform: edgeDef.transform,
			})
			// add the source as a predecessor of the target
			targetNode.predecessorIds.add(sourceNode.id)
		}

		// find the start node (node with no incoming edges)
		const startNode = this.findStartNode(nodeMap)

		return new ExecutableFlow<TContext>(startNode, nodeMap, this, functionRegistry)
	}

	/**
	 * Find the implementation for a given node definition
	 */
	private findNodeImplementation(
		nodeDef: Pick<NodeDefinition<TNodeMap>, 'id' | 'uses'>,
		functionRegistry: Map<string, any>,
	): any {
		const builtInNodes = ['parallel-container', 'batch-processor', 'loop-controller', 'subflow']
		// built-in nodes are handled by name in the executor
		if (builtInNodes.includes(nodeDef.uses))
			return nodeDef.uses
		if (this.registry[nodeDef.uses])
			return this.registry[nodeDef.uses].implementation
		if (functionRegistry.has(nodeDef.uses))
			return functionRegistry.get(nodeDef.uses)
		throw new Error(`Node implementation '${nodeDef.uses}' for node '${nodeDef.id}' not found in any registry.`)
	}

	/**
	 * Find the starting node for execution. If multiple start nodes are found,
	 * wrap them in a synthetic parallel container to create a single entry point.
	 */
	private findStartNode(
		nodeMap: Map<string, CompiledNode>,
	): CompiledNode {
		// identify all nodes that are part of a parallel branch, as they are not valid start nodes
		const branchNodes = new Set<string>()
		for (const node of nodeMap.values()) {
			// also treat batch worker nodes as internal branch nodes, not start nodes
			if (node.implementation === 'batch-processor' && node.params.workerNodeId) {
				branchNodes.add(node.params.workerNodeId)
			}
			if (node.implementation === 'parallel-container' && Array.isArray(node.params.branches)) {
				for (const branchId of node.params.branches) {
					branchNodes.add(branchId)
				}
			}
		}

		const startNodes = Array.from(nodeMap.values()).filter(
			node => node.predecessorIds.size === 0 && !branchNodes.has(node.id),
		)

		if (startNodes.length === 0 && nodeMap.size > 0) {
			// check if the only nodes without predecessors are branch nodes, which is a valid DAG start
			if (Array.from(nodeMap.values()).every(node => node.predecessorIds.size > 0 || branchNodes.has(node.id)))
				throw new Error('No start node found. A workflow must have at least one node with no incoming edges that is not a parallel branch.')
			throw new Error('No start node found - all nodes have incoming edges (cycle detected).')
		}

		if (startNodes.length === 1)
			return startNodes[0]

		// handle multiple start nodes by creating a synthetic parallel root
		const syntheticRoot: CompiledNode = {
			id: '__synthetic_root__',
			implementation: 'parallel-container',
			params: {
				branches: startNodes.map(n => n.id),
			},
			config: {},
			predecessorIds: new Set(),
			nextNodes: [], // the container's output is not wired to a next step by default
		}
		nodeMap.set(syntheticRoot.id, syntheticRoot)
		return syntheticRoot
	}

	/**
	 * Register a blueprint for use as a sub-workflow
	 */
	registerBlueprint(blueprint: WorkflowBlueprint<TNodeMap>): void {
		this.blueprintCache.set(blueprint.id, blueprint)
	}

	getBlueprint(id: string): WorkflowBlueprint<TNodeMap> | undefined {
		return this.blueprintCache.get(id)
	}

	getDependencies(): RuntimeDependencies {
		return this.dependencies
	}

	getEventBus(): IEventBus {
		return this.eventBus
	}

	getConditionEvaluator(): IConditionEvaluator {
		return this.conditionEvaluator
	}

	getSerializer(): ISerializer {
		return this.serializer
	}

	getMiddleware(): Middleware<TContext>[] {
		return this.middleware
	}

	clearCache(): void {
		this.compiledFlows.clear()
	}

	getCacheStats(): { size: number, keys: string[] } {
		return {
			size: this.compiledFlows.size,
			keys: Array.from(this.compiledFlows.keys()),
		}
	}

	/**
	 * [NEW] Finds the starting node(s) for a given blueprint.
	 * Essential for a distributed client to kick off the workflow.
	 */
	public findStartNodes(blueprint: WorkflowBlueprint<TNodeMap>): NodeDefinition<TNodeMap>[] {
		const targetNodeIds = new Set(blueprint.edges.map(e => e.target))
		return blueprint.nodes.filter(node => !targetNodeIds.has(node.id))
	}

	/**
	 * [NEW] Executes a single node from a blueprint with full resiliency.
	 * This is the core method for a distributed worker.
	 */
	public async executeNode(
		blueprint: WorkflowBlueprint<TNodeMap>,
		nodeId: string,
		context: IContext<TContext>,
	): Promise<NodeResult> {
		const nodeDef = blueprint.nodes.find(n => n.id === nodeId)
		if (!nodeDef) {
			throw new Error(`Node with ID '${nodeId}' not found in blueprint '${blueprint.id}'`)
		}

		return this._executeNodeWithResiliency(nodeDef, context)
	}

	/**
	 * [NEW] Determines the next nodes to execute based on a node's result.
	 * This is the core orchestration method for a distributed worker.
	 */
	public async determineNextNodes(
		blueprint: WorkflowBlueprint<TNodeMap>,
		nodeId: string,
		result: NodeResult,
		context: IContext<TContext>,
	): Promise<NodeDefinition<TNodeMap>[]> {
		const edges = blueprint.edges.filter(e => e.source === nodeId)
		if (edges.length === 0)
			return []

		let matchingEdges: EdgeDefinition[] = []

		// Handle action-based routing
		if (result.action) {
			matchingEdges = edges.filter(edge => edge.action === result.action)
		}

		// Handle condition-based routing if no action match
		if (matchingEdges.length === 0) {
			const contextSnapshot = await context.toJSON()
			for (const edge of edges.filter(e => e.condition)) {
				const evalContext = { ...contextSnapshot, result: result.output }
				if (await this.conditionEvaluator.evaluate(edge.condition!, evalContext)) {
					matchingEdges.push(edge)
				}
			}
		}

		// Fallback to default edge
		if (matchingEdges.length === 0) {
			matchingEdges = edges.filter(edge => !edge.action && !edge.condition)
		}

		const nextNodeIds = new Set(matchingEdges.map(e => e.target))
		return blueprint.nodes.filter(n => nextNodeIds.has(n.id))
	}

	/**
	 * [NEW] Wraps the execution of a single node with resiliency logic (retries, fallback, timeout).
	 * This version works with NodeDefinition and async IContext.
	 */
	private async _executeNodeWithResiliency(nodeDef: NodeDefinition<TNodeMap>, context: IContext<TContext>): Promise<NodeResult> {
		const { maxRetries = 1, retryDelay = 0, timeout } = nodeDef.config || {}
		let lastError: Error | undefined
		const executionId = context.getMetadata().executionId
		let result: NodeResult | undefined
		let executionError: Error | undefined

		await this.eventBus.emit('node:start', { executionId, nodeId: nodeDef.id })
		const startTime = Date.now()

		try {
			// Execute beforeNode middleware hooks
			for (const mw of this.middleware) {
				if (mw.beforeNode) {
					await mw.beforeNode(context, nodeDef.id)
				}
			}

			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					// check for cancellation before each attempt
					if (context.getMetadata().signal?.aborted) {
						throw new Error('Operation aborted.') // generic error to be caught and converted
					}
					const executionPromise = this._executeNodeLogic(nodeDef, context)
					/* eslint-disable style/indent */
					const nodeResult = timeout
						? await Promise.race([
							executionPromise,
							new Promise<NodeResult>((_, reject) =>
								setTimeout(() => reject(new Error('Node execution timed out')), timeout),
							),
						])
						: await executionPromise
					/* eslint-enable style/indent */

					if (nodeResult.error) {
						throw new Error(nodeResult.error.message) // propagate node-level error for retry
					}

					await this.eventBus.emit('node:finish', {
						executionId,
						nodeId: nodeDef.id,
						duration: Date.now() - startTime,
						result: nodeResult,
					})

					result = nodeResult
					return result
				}
				catch (error) {
					// if it's an abort, break the retry loop and re-throw.
					if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Operation aborted.')) {
						throw error
					}
					// if it's a fatal error, bypass retries and fallbacks immediately.
					if (error instanceof FatalNodeExecutionError) {
						console.log('Fatal error detected in inner catch, re-throwing')
						throw error
					}
					lastError = error instanceof Error ? error : new Error('Unknown error during node execution')
					if (attempt < maxRetries) {
						await this.eventBus.emit('node:retry', {
							executionId,
							nodeId: nodeDef.id,
							attempt,
							maxRetries,
							error: lastError.message,
						})
						if (retryDelay > 0) {
							await new Promise(resolve => setTimeout(resolve, retryDelay))
						}
					}
				}
			}

			// all retries failed, attempt fallback
			await this.eventBus.emit('node:fallback', { executionId, nodeId: nodeDef.id, error: lastError?.message })
			if (nodeDef.config?.fallback) {
				// Execute beforeNode middleware for fallback
				for (const mw of this.middleware) {
					if (mw.beforeNode) {
						await mw.beforeNode(context, nodeDef.id)
					}
				}

				const fallbackNodeDef = { ...nodeDef, uses: nodeDef.config.fallback }
				const fallbackResult = await this._executeNodeLogic(fallbackNodeDef, context)
				await this.eventBus.emit('node:finish', {
					executionId,
					nodeId: nodeDef.id,
					duration: Date.now() - startTime,
					result: fallbackResult,
					isFallback: true,
				})

				result = fallbackResult
				return result
			}

			// no fallback, throw the final error
			throw lastError
		}
		catch (error) {
			// if it's a fatal error, bypass all processing and re-throw immediately
			if (error instanceof FatalNodeExecutionError) {
				throw error
			}

			executionError = error instanceof Error ? error : new Error('Unknown error')

			// convert abort-style errors into CancelledWorkflowError
			if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Operation aborted.'))
				throw new CancelledWorkflowError('Node execution cancelled.', executionId)

			await this.eventBus.emit('node:error', {
				executionId,
				nodeId: nodeDef.id,
				duration: Date.now() - startTime,
				error: executionError.message,
			})
			throw new NodeExecutionError(executionError.message, nodeDef.id, context.getMetadata().blueprintId, executionId, executionError)
		}
		finally {
			// Always execute afterNode middleware hooks, even on error or fatal failure
			try {
				const finalResult: NodeResult = result || { error: { message: executionError?.message || 'Unknown error' } }
				for (const mw of this.middleware.reverse()) {
					if (mw.afterNode) {
						await mw.afterNode(context, nodeDef.id, finalResult)
					}
				}
			}
			catch (middlewareError) {
				// If middleware fails, log it but don't override the original error
				console.warn('Middleware afterNode hook failed:', middlewareError)
			}
		}
	}

	/**
	 * [FIXED] Execute a single node's core logic using async IContext.
	 */
	private async _executeNodeLogic(nodeDef: NodeDefinition<TNodeMap>, context: IContext<TContext>): Promise<NodeResult> {
		// --- THIS IS THE FIX ---
		// Handle built-in node types before attempting to find a function implementation.
		if (nodeDef.uses === 'subflow') {
			return this._executeSubflow(nodeDef, context)
		}
		// You would add 'parallel-container', 'loop-controller', etc. here in the future.
		// --- END FIX ---

		// Find the implementation from the registry or inline functions
		const implementation = this.findNodeImplementation(nodeDef, new Map()) // Assuming no dynamic functions for now

		if (typeof implementation !== 'function') {
			throw new TypeError(`Node implementation for '${nodeDef.uses}' is not a function.`)
		}

		// Create the NodeContext object that the node function will receive
		const nodeContext: NodeContext<TContext> = {
			context,
			// The 'input' is conventionally the output of the previous node.
			// In a true distributed model, there isn't a single "previous" node,
			// so we rely on nodes getting their data explicitly from context via their `inputs` mapping.
			input: await context.get('input' as any), // Kept for convention
			metadata: context.getMetadata(),
			dependencies: this.getDependencies(),
			params: nodeDef.params || {},
		}

		if (implementation.prototype?.execute) {
			// Class-based node
			const instance = new implementation(nodeDef.params) // eslint-disable-line new-cap
			return await instance.execute(nodeContext)
		}
		else {
			// Function-based node
			return await implementation(nodeContext)
		}
	}

	/**
	 * [NEW] Executes a sub-workflow blueprint, adapted for IContext.
	 */
	private async _executeSubflow(nodeDef: NodeDefinition<TNodeMap>, parentContext: IContext<TContext>): Promise<NodeResult> {
		const { blueprintId, inputs = {}, outputs = {} } = nodeDef.params || {}
		if (!blueprintId) {
			return { error: { message: `Subflow node '${nodeDef.id}' is missing 'blueprintId' in its params.` } }
		}

		const subBlueprint = this.getBlueprint(blueprintId)
		if (!subBlueprint) {
			return { error: { message: `Sub-workflow blueprint with ID '${blueprintId}' not found.` } }
		}

		const subContextData: Record<string, any> = {}
		for (const [subKey, parentKey] of Object.entries(inputs as Record<string, string>)) {
			if (await parentContext.has(parentKey as any)) {
				subContextData[subKey] = await parentContext.get(parentKey as any)
			}
		}

		// Sub-workflows run as a self-contained, in-memory process.
		const subResult = await this.run(
			subBlueprint,
			subContextData as Partial<TContext>,
			undefined, // Use the runtime's main function registry
			parentContext.getMetadata().signal,
		)

		if (subResult.metadata.status !== 'completed') {
			throw subResult.metadata.error?.details || new Error('Sub-workflow failed without details.')
		}

		const subFinalContext = createAsyncContext(subResult.context, parentContext.getMetadata())

		for (const [parentKey, subKey] of Object.entries(outputs as Record<string, string>)) {
			if (await subFinalContext.has(subKey as any)) {
				await parentContext.set(parentKey as any, await subFinalContext.get(subKey as any))
			}
		}

		return { output: await subFinalContext.get('final_output' as any) }
	}
}

/**
 * A compiled, executable node
 */
interface CompiledNode {
	id: string
	implementation: any
	fallbackImplementation?: any
	params: Record<string, any>
	config: any
	predecessorIds: Set<string>
	nextNodes: Array<{
		node: CompiledNode
		action?: string
		condition?: string
		transform?: string
	}>
}

/**
 * An executable flow that can be run
 */
export class ExecutableFlow<TContext extends Record<string, any>> {
	private startNode: CompiledNode
	private nodeMap: Map<string, CompiledNode>
	private runtime: FlowcraftRuntime<TContext>
	private eventBus: IEventBus
	private conditionEvaluator: IConditionEvaluator
	private functionRegistry: Map<string, any>
	private middleware: Middleware<TContext>[]

	constructor(
		startNode: CompiledNode,
		nodeMap: Map<string, CompiledNode>,
		runtime: FlowcraftRuntime<TContext>,
		functionRegistry: Map<string, any>,
	) {
		this.startNode = startNode
		this.nodeMap = nodeMap
		this.runtime = runtime
		this.eventBus = runtime.getEventBus()
		this.conditionEvaluator = runtime.getConditionEvaluator()
		this.functionRegistry = functionRegistry
		this.middleware = runtime.getMiddleware() || []
	}

	/**
	 * Execute the flow using a frontier-based approach that supports DAGs and cycles.
	 */
	async execute(context: Context<TContext>): Promise<Context<TContext>> {
		let frontier: CompiledNode[] = [this.startNode]
		const executedNodeIds = new Set<string>()
		const receivedInputs = new Map<string, Set<string>>() // tracks which inputs a node has received

		while (frontier.length > 0) {
			if (context.getMetadata().signal?.aborted) {
				throw new CancelledWorkflowError('Workflow execution cancelled.', context.getMetadata().executionId)
			}

			const executionPromises = frontier.map(async (node) => {
				// mutate metadata on the main context object
				context.setMetadata({ currentNodeId: node.id })
				// pass the main context object directly; any modifications will persist
				const result = await this._executeCompiledNodeWithResiliency(node, context)
				return { node, result }
			})

			const results = await Promise.all(executionPromises)
			const nextFrontierSet = new Set<CompiledNode>()

			// step 1: update context with results and mark nodes as executed
			for (const { node, result } of results) {
				if (node.id !== '__synthetic_root__') {
					context.set(node.id as any, result.output)
					// set the 'input' for the next nodes.
					if (result.output !== undefined) {
						context.set('input' as any, result.output)
					}
				}
				executedNodeIds.add(node.id)
			}

			// step 2: determine the next set of nodes to execute
			for (const { node, result } of results) {
				// special handling for parallel containers: their branches' next nodes should be included
				if (node.implementation === 'parallel-container' && node.params.branches) {
					const branchIds = node.params.branches as string[]
					for (const branchId of branchIds) {
						const branchNode = this.nodeMap.get(branchId)
						if (branchNode) {
							const branchNextNodes = await this.getNextNodes(branchNode, { output: await context.get(branchId as any) }, context)
							for (const nextNode of branchNextNodes) {
								if (!receivedInputs.has(nextNode.id)) {
									receivedInputs.set(nextNode.id, new Set())
								}
								receivedInputs.get(nextNode.id)!.add(branchId)

								const predecessors = this.nodeMap.get(nextNode.id)?.predecessorIds ?? new Set()
								const received = receivedInputs.get(nextNode.id)!

								const joinStrategy = this.nodeMap.get(nextNode.id)?.config.joinStrategy || 'all'
								const isReady = (joinStrategy === 'any' && received.size > 0)
									|| (joinStrategy === 'all' && Array.from(predecessors).every(p => received.has(p)))
								if (isReady)
									nextFrontierSet.add(nextNode)
							}
						}
					}
					// also handle the parallel container's own next nodes (for normal flow continuation)
					const containerNextNodes = await this.getNextNodes(node, result, context)
					for (const nextNode of containerNextNodes) {
						if (!receivedInputs.has(nextNode.id)) {
							receivedInputs.set(nextNode.id, new Set())
						}
						receivedInputs.get(nextNode.id)!.add(node.id)

						const predecessors = this.nodeMap.get(nextNode.id)?.predecessorIds ?? new Set()
						const received = receivedInputs.get(nextNode.id)!

						const joinStrategy = this.nodeMap.get(nextNode.id)?.config.joinStrategy || 'all'
						const isReady = (joinStrategy === 'any' && received.size > 0)
							|| (joinStrategy === 'all' && Array.from(predecessors).every(p => received.has(p)))
						if (isReady)
							nextFrontierSet.add(nextNode)
					}
					continue // skip the normal processing for parallel containers
				}

				const potentialNextNodes = await this.getNextNodes(node, result, context)
				for (const nextNode of potentialNextNodes) {
					// update received inputs for the next node
					if (!receivedInputs.has(nextNode.id)) {
						receivedInputs.set(nextNode.id, new Set())
					}
					receivedInputs.get(nextNode.id)!.add(node.id)

					const predecessors = this.nodeMap.get(nextNode.id)?.predecessorIds ?? new Set()
					const received = receivedInputs.get(nextNode.id)!

					// a node is ready if all predecessors have sent input. an exception is made for nodes with 'any' join strategy,
					// which can run as soon as _any_ input is received (this breaks potential fan-in deadlock for loops)
					const joinStrategy = this.nodeMap.get(nextNode.id)?.config.joinStrategy || 'all'
					const isReady = (joinStrategy === 'any' && received.size > 0)
						|| (joinStrategy === 'all' && Array.from(predecessors).every(p => received.has(p)))
					if (isReady) {
						nextFrontierSet.add(nextNode)
						// once a node with 'any' join strategy is scheduled, clear its inputs so it can be triggered again by the feedback edge
						if (joinStrategy === 'any')
							received.clear()
					}
				}
			}
			frontier = Array.from(nextFrontierSet)
		}

		return context
	}

	/**
	 * Wraps the execution of a single compiled node with resiliency logic (retries, fallback, timeout).
	 * This version works with CompiledNode and synchronous Context.
	 */
	private async _executeCompiledNodeWithResiliency(node: CompiledNode, context: Context<TContext>): Promise<NodeResult> {
		const { maxRetries = 1, retryDelay = 0, timeout } = node.config
		let lastError: Error | undefined
		const executionId = context.getMetadata().executionId
		let afterNodeExecuted = false
		let result: NodeResult | undefined
		let executionError: Error | undefined

		await this.eventBus.emit('node:start', { executionId, nodeId: node.id })
		const startTime = Date.now()

		try {
			// Execute beforeNode middleware hooks
			for (const mw of this.middleware) {
				if (mw.beforeNode) {
					await mw.beforeNode(context, node.id)
				}
			}

			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					// check for cancellation before each attempt
					if (context.getMetadata().signal?.aborted) {
						throw new Error('Operation aborted.') // generic error to be caught and converted
					}
					const executionPromise = this.executeNode(node, context)
					/* eslint-disable style/indent */
					const nodeResult = timeout
						? await Promise.race([
							executionPromise,
							new Promise<NodeResult>((_, reject) =>
								setTimeout(() => reject(new Error('Node execution timed out')), timeout),
							),
						])
						: await executionPromise
					/* eslint-enable style/indent */

					if (nodeResult.error) {
						throw new Error(nodeResult.error.message) // propagate node-level error for retry
					}

					result = nodeResult

					await this.eventBus.emit('node:finish', {
						executionId,
						nodeId: node.id,
						duration: Date.now() - startTime,
						result,
					})

					// Execute afterNode middleware hooks in reverse order (LIFO)
					for (const mw of this.middleware.reverse()) {
						if (mw.afterNode) {
							await mw.afterNode(context, node.id, result)
						}
					}

					afterNodeExecuted = true
					return result
				}
				catch (error) {
					// if it's an abort, break the retry loop and re-throw.
					if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Operation aborted.')) {
						throw error
					}
					// if it's a fatal error, bypass retries and fallbacks immediately.
					if (error instanceof FatalNodeExecutionError) {
						throw error
					}
					lastError = error instanceof Error ? error : new Error('Unknown error during node execution')
					if (attempt < maxRetries) {
						await this.eventBus.emit('node:retry', {
							executionId,
							nodeId: node.id,
							attempt,
							maxRetries,
							error: lastError.message,
						})
						if (retryDelay > 0) {
							await new Promise(resolve => setTimeout(resolve, retryDelay))
						}
					}
				}
			}

			// all retries failed, attempt fallback
			await this.eventBus.emit('node:fallback', { executionId, nodeId: node.id, error: lastError?.message })
			if (node.fallbackImplementation) {
				// node.fallbackImplementation already contains the actual function implementation
				if (!node.fallbackImplementation) {
					throw new Error(`Fallback implementation not found for node ${node.id}`)
				}

				// Create a proper fallback node context and execute the fallback implementation directly
				const nodeContext: NodeContext<TContext> = {
					context,
					input: await context.get('input' as keyof TContext),
					metadata: context.getMetadata(),
					dependencies: this.runtime.getDependencies(),
					params: node.params,
				}

				let fallbackResult: NodeResult
				if (typeof node.fallbackImplementation === 'function') {
					if (node.fallbackImplementation.prototype?.execute) {
						// class-based fallback
						const instance = new node.fallbackImplementation(node.params) // eslint-disable-line new-cap
						fallbackResult = await instance.execute(nodeContext)
					}
					else {
						// function-based fallback
						fallbackResult = await node.fallbackImplementation(nodeContext)
					}
				}
				else {
					throw new TypeError(`Unknown fallback implementation type for ${node.id}: ${node.fallbackImplementation}`)
				}

				result = fallbackResult
				await this.eventBus.emit('node:finish', {
					executionId,
					nodeId: node.id,
					duration: Date.now() - startTime,
					result: fallbackResult,
					isFallback: true,
				})

				return fallbackResult
			}

			// no fallback, throw the final error
			throw lastError
		}
		catch (error) {
			// if it's a fatal error, bypass all processing and re-throw immediately
			if (error instanceof FatalNodeExecutionError) {
				throw error
			}

			// Store the error for the finally block
			executionError = error instanceof Error ? error : new Error('Unknown error')

			// convert abort-style errors into CancelledWorkflowError
			if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Operation aborted.'))
				throw new CancelledWorkflowError('Node execution cancelled.', executionId)

			await this.eventBus.emit('node:error', {
				executionId,
				nodeId: node.id,
				duration: Date.now() - startTime,
				error: executionError.message,
			})
			throw new NodeExecutionError(executionError.message, node.id, context.getMetadata().blueprintId, executionId, executionError)
		}
		finally {
			// Always execute afterNode middleware hooks, even on error or fatal failure
			if (!afterNodeExecuted) {
				try {
					const finalResult: NodeResult = result || { error: { message: executionError?.message || 'Unknown error' } }
					for (const mw of this.middleware.reverse()) {
						if (mw.afterNode) {
							await mw.afterNode(context, node.id, finalResult)
						}
					}
				}
				catch (middlewareError) {
					// If middleware fails, log it but don't override the original error
					console.warn('Middleware afterNode hook failed:', middlewareError)
				}
			}
		}
	}

	/**
	 * Execute a single node's core logic.
	 */
	private async executeNode(
		node: CompiledNode,
		context: Context<TContext>,
	): Promise<NodeResult> {
		if (node.implementation === 'parallel-container') {
			return this._executeParallelContainer(node, context)
		}
		if (node.implementation === 'batch-processor') {
			return this._executeBatchProcessor(node, context)
		}
		if (node.implementation === 'loop-controller') {
			return this._executeLoopController(node, context)
		}
		if (node.implementation === 'subflow') {
			return this._executeSubflow(node, context)
		}

		// standard node implementation (function or class)
		const nodeContext: NodeContext<TContext> = {
			context,
			input: await context.get('input' as keyof TContext),
			metadata: context.getMetadata(),
			dependencies: this.runtime.getDependencies(),
			params: node.params,
		}

		if (typeof node.implementation === 'function') {
			if (node.implementation.prototype?.execute) {
				// class-based node
				const instance = new node.implementation(node.params) // eslint-disable-line new-cap
				return await instance.execute(nodeContext)
			}
			else {
				// function-based node
				return await node.implementation(nodeContext)
			}
		}

		throw new Error(`Unknown node implementation type for ${node.id}: ${node.implementation}`)
	}

	/**
	 * Executes a sub-workflow blueprint.
	 */
	private async _executeSubflow(node: CompiledNode, parentContext: Context<TContext>): Promise<NodeResult> {
		const { blueprintId, inputs = {}, outputs = {} } = node.params
		if (!blueprintId) {
			return { error: { message: `Subflow node '${node.id}' is missing 'blueprintId' in its params.` } }
		}

		const subBlueprint = this.runtime.getBlueprint(blueprintId)
		if (!subBlueprint) {
			return { error: { message: `Sub-workflow blueprint with ID '${blueprintId}' not found.` } }
		}

		// create a scoped context for the sub-workflow
		const subContextData: Record<string, any> = {}
		// apply input mappings
		for (const [subKey, parentKey] of Object.entries(inputs)) {
			if (await parentContext.has(parentKey as any)) {
				subContextData[subKey] = await parentContext.get(parentKey as any)
			}
		}

		// run the sub-workflow (it inherits the signal from the parent)
		const subResult = await this.runtime.run(
			subBlueprint,
			subContextData as Partial<TContext>,
			this.functionRegistry, // pass the combined function registry
			parentContext.getMetadata().signal,
		)

		if (subResult.metadata.status === 'failed' || subResult.metadata.status === 'cancelled') {
			throw subResult.metadata.error?.details // propagate the error
		}

		const subFinalContext = createContext(subResult.context, parentContext.getMetadata()) as unknown as Context<TContext>

		// apply output mappings
		for (const [parentKey, subKey] of Object.entries(outputs)) {
			if (await subFinalContext.has(subKey as any)) {
				const value = await subFinalContext.get(subKey as any)
				if (value !== undefined) {
					parentContext.set(parentKey as any, value)
				}
			}
		}

		// the final 'input' of the sub-workflow's context becomes the output of this node
		// but if the sub-workflow has a specific output node, we should return that
		const finalInput = subFinalContext.get('input' as any)
		return { output: finalInput }
	}

	/**
	 * Executes the branches of a parallel container and aggregates results.
	 */
	private async _executeParallelContainer(node: CompiledNode, context: Context<TContext>): Promise<NodeResult> {
		const branchIds = node.params.branches as string[] | undefined
		if (!branchIds) {
			return { error: { message: 'Parallel container is missing "branches" in its params' } }
		}

		const branchNodes = branchIds.map(id => this.nodeMap.get(id)).filter(Boolean) as CompiledNode[]

		// use shared context for all branches to allow cross-communication
		const promises = branchNodes.map(branchNode =>
			new ExecutableFlow(branchNode, this.nodeMap, this.runtime, this.functionRegistry).execute(context.createScope() as Context<TContext>),
		)

		const settledResults = await Promise.allSettled(promises)

		const outputs: any[] = []
		for (const result of settledResults) {
			if (result.status === 'rejected') {
				// if any branch fails, the whole container fails
				throw result.reason
			}
			const branchContext = result.value
			// the conventional output of a branch is the final value of the 'input' key
			outputs.push(await branchContext.get('input' as any))
			// merge the results from the branch scope back into the main context
			context.mergeSync(branchContext)
		}

		// the output of the container is an array of the outputs of its branches
		return { output: outputs }
	}

	/**
	 * Executes a batch processor that processes items from an array.
	 */
	private async _executeBatchProcessor(node: CompiledNode, context: Context<TContext>): Promise<NodeResult> {
		const { concurrency = 1, workerImplementationKey } = node.params
		const inputArray = await context.get('input' as any)

		if (!workerImplementationKey || typeof workerImplementationKey !== 'string')
			return { error: { message: `Batch processor node '${node.id}' requires a 'workerImplementationKey' parameter.` } }

		const workerImplementation = this.functionRegistry.get(workerImplementationKey)
		if (!workerImplementation)
			return { error: { message: `Batch processor could not find worker implementation for key '${workerImplementationKey}'.` } }

		if (!Array.isArray(inputArray))
			return { error: { message: 'Batch processor expects an array as input' } }

		const results: any[] = []
		const semaphore = new Semaphore(concurrency)
		const promises = inputArray.map((item: any) =>
			semaphore.acquire(async () => {
				// each item gets its own scope with the item set as 'input'
				const itemContext = context.createScope({ input: item }) as Context<TContext>
				const itemResult = await this._processBatchItemWithImplementation(workerImplementation, itemContext)

				// after execution, merge any state changes from the item's scope back to the main context
				context.mergeSync(itemContext)
				return itemResult
			}),
		)

		const settledResults = await Promise.allSettled(promises)

		for (const result of settledResults) {
			if (result.status === 'rejected') {
				throw result.reason // fail the whole batch if any item fails
			}
			if (result.value.error) {
				return result.value // propagate error from worker
			}
			results.push(result.value.output)
		}

		return { output: results }
	}

	/**
	 * Process a single item in a batch by executing the specified worker implementation.
	 */
	private async _processBatchItemWithImplementation(workerImplementation: any, context: Context<TContext>): Promise<NodeResult> {
		// Execute the worker directly
		const nodeContext: NodeContext<TContext> = {
			context,
			input: await context.get('input' as any),
			metadata: context.getMetadata(),
			dependencies: this.runtime.getDependencies(),
			params: {},
		}
		if (typeof workerImplementation === 'function') {
			if (workerImplementation.prototype?.execute) {
				// eslint-disable-next-line new-cap
				const instance = new workerImplementation()
				return await instance.execute(nodeContext)
			}
			else {
				return await workerImplementation(nodeContext)
			}
		}
		throw new Error(`Unknown worker implementation type`)
	}

	/**
	 * Executes a loop controller that manages iteration logic.
	 */
	private async _executeLoopController(node: CompiledNode, context: Context<TContext>): Promise<NodeResult> {
		const { maxIterations = 100, condition } = node.params

		const iterations = await context.get('loop_iterations' as any) || 0
		if (iterations >= maxIterations) {
			return { action: 'break' }
		}

		await (context as any).set('loop_iterations', iterations + 1)

		if (condition) {
			const contextData = await context.toJSON()
			const evalContext = {
				...contextData,
				iterations, // use the pre-incremented value for the check
			}
			const shouldContinue = await this.conditionEvaluator.evaluate(condition, evalContext)
			if (!shouldContinue) {
				return { action: 'break' }
			}
		}

		return { action: 'continue' }
	}

	/**
	 * Get all next nodes based on execution result and conditional edges.
	 */
	private async getNextNodes(
		currentNode: CompiledNode,
		result: NodeResult,
		context: Context<TContext>,
	): Promise<CompiledNode[]> {
		// special handling for batch processor: it's a container.. its "next" node is the one connected _from_ the container, not the worker inside it
		if (currentNode.implementation === 'batch-processor') {
			// the successor is any node connected from the batch processor that isn't the worker
			const workerId = currentNode.params.workerNodeId
			const successorEdge = currentNode.nextNodes.find(edge => edge.node.id !== workerId)
			return successorEdge ? [successorEdge.node] : []
		}

		if (!currentNode.nextNodes || currentNode.nextNodes.length === 0)
			return []

		const candidates = currentNode.nextNodes
		let matchingEdges: typeof candidates = []

		if (result.action) {
			matchingEdges = candidates.filter(edge => edge.action === result.action)
		}

		if (matchingEdges.length === 0) {
			const conditionalEdges = candidates.filter(edge => edge.condition)
			for (const edge of conditionalEdges) {
				const evalContext = { ...context.toJSON(), result: result.output }
				if (await this.conditionEvaluator.evaluate(edge.condition!, evalContext)) {
					matchingEdges.push(edge)
				}
			}
		}

		if (matchingEdges.length === 0) {
			matchingEdges = candidates.filter(edge => !edge.action && !edge.condition)
		}

		const nextNodes: CompiledNode[] = []
		for (const edge of matchingEdges) {
			if (edge.transform) {
				const transformedOutput = await this._applyTransform(edge.transform, result.output, context)
				context.set('input' as any, transformedOutput)
			}
			nextNodes.push(edge.node)
		}

		return nextNodes
	}

	/**
	 * Apply a transformation to the output data.
	 */
	private async _applyTransform(transform: string, output: any, context: Context<TContext>): Promise<any> {
		try {
			// simple transformation evaluator - supports basic expressions
			// for example: "input * 2", "input.toUpperCase()", "input.map(x => x * 2)"
			const transformContext = {
				input: output,
				context: context.toJSON(),
			}

			// Function constructor for safe evaluation
			const transformFn = new Function('input', 'context', `return ${transform}`) // eslint-disable-line no-new-func
			return transformFn(transformContext.input, transformContext.context)
		}
		catch (error) {
			throw new Error(`Failed to apply transform "${transform}": ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	}
}

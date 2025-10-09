import type { Context } from './context'
import type {
	ExecutionMetadata,
	IConditionEvaluator,
	IEventBus,
	ISerializer,
	NodeContext,
	NodeDefinition,
	NodeRegistry,
	NodeResult,
	RuntimeDependencies,
	RuntimeOptions,
	WorkflowBlueprint,
	WorkflowResult,
} from './types'
import { randomUUID } from 'node:crypto'
import { createContext } from './context'
import { CancelledWorkflowError, NodeExecutionError } from './errors'

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
		// Use regex to find operators, ordered by length (longest first) to avoid partial matches
		const operatorPattern = /(!==|===|<=|>=|==|!=|[<>=])/
		const match = condition.match(operatorPattern)

		if (!match) {
			return null
		}

		const operator = match[1]
		const index = match.index!

		if (index === 0) {
			return null // Operator at start is invalid
		}

		const leftPath = condition.substring(0, index).trim()
		const rightStr = condition.substring(index + operator.length).trim()

		return { leftPath, operator, rightStr }
	}

	evaluate(condition: string, context: Record<string, any>): boolean {
		// Parse the condition to avoid regex backtracking issues
		const parsed = this.parseCondition(condition)
		if (!parsed) {
			// Fallback for simple truthy checks like "result.isAdmin"
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
		// Handle strings like "'admin'" or '"admin"'
		if ((str.startsWith('\'') && str.endsWith('\'')) || (str.startsWith('"') && str.endsWith('"')))
			return str.slice(1, -1)

		return str
	}
}

/**
 * Handles compilation, caching, and execution of workflow blueprints
 */
export class FlowcraftRuntime<TContext extends Record<string, any> = Record<string, any>> {
	private registry: NodeRegistry
	private dependencies: RuntimeDependencies
	private defaultNodeConfig: any
	private environment: 'development' | 'staging' | 'production'
	private compiledFlows: Map<string, ExecutableFlow<TContext>>
	private blueprintCache: Map<string, WorkflowBlueprint>
	private eventBus: IEventBus
	private conditionEvaluator: IConditionEvaluator
	private serializer: ISerializer

	constructor(options: RuntimeOptions) {
		this.registry = options.registry
		this.dependencies = options.dependencies || {}
		this.defaultNodeConfig = options.defaultNodeConfig || {}
		this.environment = options.environment || 'development'
		this.eventBus = options.eventBus || new NullEventBus()
		this.conditionEvaluator = options.conditionEvaluator || new DefaultConditionEvaluator()
		this.serializer = options.serializer || new JsonSerializer()
		this.compiledFlows = new Map()
		this.blueprintCache = new Map()
	}

	/**
	 * Run a workflow blueprint
	 */
	async run(
		blueprint: WorkflowBlueprint,
		initialContext: Partial<TContext> = {},
		functionRegistry?: Map<string, any>,
		signal?: AbortSignal,
	): Promise<WorkflowResult<TContext>> {
		const startTime = new Date()
		const executionId = randomUUID()
		let finalContext: Context<TContext> | undefined
		let status: 'completed' | 'failed' | 'cancelled' = 'completed'
		let finalError: NodeExecutionError | CancelledWorkflowError | undefined

		// Handle immediate cancellation
		if (signal?.aborted) {
			const err = new CancelledWorkflowError('Workflow cancelled before execution could start.', executionId)
			// Even though we throw, we still want to emit the lifecycle events.
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
				const context = createContext<TContext>(initialContext, metadata)
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
			context: finalContext?.toJSON() as TContext ?? initialContext as TContext,
			metadata: {
				executionId,
				blueprintId: blueprint.id,
				startedAt: startTime,
				completedAt: endTime,
				duration: endTime.getTime() - startTime.getTime(),
				status,
				error: finalError
					? {
							nodeId: finalError instanceof NodeExecutionError ? finalError.nodeId : 'workflow_runtime',
							message: finalError.message,
							details: finalError,
						}
					: undefined,
			},
		}

		await this.eventBus.emit('workflow:finish', result)

		if (finalError) {
			throw finalError
		}
		return result
	}

	/**
	 * Get a compiled flow from cache or compile it
	 */
	private async getOrCompileFlow(blueprint: WorkflowBlueprint, functionRegistry?: Map<string, any>): Promise<ExecutableFlow<TContext>> {
		// If a function registry is provided, it might contain different implementations,
		// so we bypass the cache to ensure we compile with the correct functions.
		const cached = !functionRegistry && this.compiledFlows.get(blueprint.id)
		if (cached) {
			return cached
		}

		// compile the blueprint
		const compiled = await this.compileBlueprint(blueprint, functionRegistry)

		// cache it only if no special function registry was provided
		if (!functionRegistry) {
			this.compiledFlows.set(blueprint.id, compiled)
		}

		return compiled
	}

	/**
	 * Compile a blueprint into an executable flow
	 */
	private async compileBlueprint(blueprint: WorkflowBlueprint, functionRegistry: Map<string, any> = new Map()): Promise<ExecutableFlow<TContext>> {
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
				predecessorIds: new Set(), // Will be populated next
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
			// Add the source as a predecessor of the target
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
		nodeDef: Pick<NodeDefinition, 'id' | 'uses'>,
		functionRegistry: Map<string, any>,
	): any {
		// Added 'subflow' to built-in nodes
		const builtInNodes = ['parallel-container', 'batch-processor', 'loop-controller', 'subflow']
		if (builtInNodes.includes(nodeDef.uses)) {
			// Built-in nodes are handled by name in the executor
			return nodeDef.uses
		}
		if (this.registry[nodeDef.uses]) {
			return this.registry[nodeDef.uses].implementation
		}
		if (functionRegistry.has(nodeDef.uses)) {
			return functionRegistry.get(nodeDef.uses)
		}
		throw new Error(`Node implementation '${nodeDef.uses}' for node '${nodeDef.id}' not found in any registry.`)
	}

	/**
	 * Find the starting node for execution. If multiple start nodes are found,
	 * wrap them in a synthetic parallel container to create a single entry point.
	 */
	private findStartNode(
		nodeMap: Map<string, CompiledNode>,
	): CompiledNode {
		// Identify all nodes that are part of a parallel branch, as they are not valid start nodes.
		const branchNodes = new Set<string>()
		for (const node of nodeMap.values()) {
			// Also treat batch worker nodes as internal branch nodes, not start nodes.
			// This prevents them from being incorrectly identified as a parallel entry point.
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
			// Check if the only nodes without predecessors are branch nodes, which is a valid DAG start
			if (Array.from(nodeMap.values()).every(node => node.predecessorIds.size > 0 || branchNodes.has(node.id))) {
				throw new Error('No start node found. A workflow must have at least one node with no incoming edges that is not a parallel branch.')
			}
			throw new Error('No start node found - all nodes have incoming edges (cycle detected).')
		}

		if (startNodes.length === 1) {
			return startNodes[0]
		}

		// Handle multiple start nodes by creating a synthetic parallel root
		const syntheticRoot: CompiledNode = {
			id: '__synthetic_root__',
			implementation: 'parallel-container',
			params: {
				branches: startNodes.map(n => n.id),
			},
			config: {},
			predecessorIds: new Set(),
			nextNodes: [], // The container's output is not wired to a next step by default
		}
		nodeMap.set(syntheticRoot.id, syntheticRoot)
		return syntheticRoot
	}

	/**
	 * Register a blueprint for use as a sub-workflow
	 */
	registerBlueprint(blueprint: WorkflowBlueprint): void {
		this.blueprintCache.set(blueprint.id, blueprint)
	}

	/**
	 * Get a registered blueprint
	 */
	getBlueprint(id: string): WorkflowBlueprint | undefined {
		return this.blueprintCache.get(id)
	}

	/**
	 * Get runtime dependencies
	 */
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

	/**
	 * Clear the compiled flow cache
	 */
	clearCache(): void {
		this.compiledFlows.clear()
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): { size: number, keys: string[] } {
		return {
			size: this.compiledFlows.size,
			keys: Array.from(this.compiledFlows.keys()),
		}
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
class ExecutableFlow<TContext extends Record<string, any>> {
	private startNode: CompiledNode
	private nodeMap: Map<string, CompiledNode>
	private runtime: FlowcraftRuntime<TContext>
	private eventBus: IEventBus
	private conditionEvaluator: IConditionEvaluator
	private functionRegistry: Map<string, any>

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
	}

	/**
	 * Execute the flow using a frontier-based approach that supports DAGs and cycles.
	 */
	async execute(context: Context<TContext>): Promise<Context<TContext>> {
		let frontier: CompiledNode[] = [this.startNode]
		const executedNodeIds = new Set<string>()
		const receivedInputs = new Map<string, Set<string>>() // Tracks which inputs a node has received

		while (frontier.length > 0) {
			if (context.getMetadata().signal?.aborted) {
				throw new CancelledWorkflowError('Workflow execution cancelled.', context.getMetadata().executionId)
			}

			const executionPromises = frontier.map(async (node) => {
				// Mutate metadata on the main context object.
				context.setMetadata({ currentNodeId: node.id })
				// Pass the main context object directly. Any modifications will persist.
				const result = await this._executeNodeWithResiliency(node, context)
				return { node, result }
			})

			const results = await Promise.all(executionPromises)
			const nextFrontierSet = new Set<CompiledNode>()

			// Step 1: Update context with results and mark nodes as executed.
			for (const { node, result } of results) {
				if (node.id !== '__synthetic_root__') {
					context.set(node.id as any, result.output)
					// Set the 'input' for the next nodes.
					if (result.output !== undefined) {
						context.set('input' as any, result.output)
					}
				}
				executedNodeIds.add(node.id)
			}

			// Step 2: Determine the next set of nodes to execute.
			for (const { node, result } of results) {
				const potentialNextNodes = await this.getNextNodes(node, result, context)
				for (const nextNode of potentialNextNodes) {
					// Update received inputs for the next node
					if (!receivedInputs.has(nextNode.id)) {
						receivedInputs.set(nextNode.id, new Set())
					}
					receivedInputs.get(nextNode.id)!.add(node.id)

					const predecessors = this.nodeMap.get(nextNode.id)?.predecessorIds ?? new Set()
					const received = receivedInputs.get(nextNode.id)!

					// A node is ready if all predecessors have sent input. An exception is made for nodes with 'any' join strategy,
					// which can run as soon as *any* input is received. This breaks the fan-in deadlock for loops.
					const joinStrategy = this.nodeMap.get(nextNode.id)?.config.joinStrategy || 'all'
					const isReady
						= (joinStrategy === 'any' && received.size > 0)
							|| (joinStrategy === 'all' && Array.from(predecessors).every(p => received.has(p)))
					if (isReady) {
						nextFrontierSet.add(nextNode)
						// Once a node with 'any' join strategy is scheduled, clear its inputs so it can be triggered again by the feedback edge.
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
	 * Wraps the execution of a single node with resiliency logic (retries, fallback, timeout).
	 */
	private async _executeNodeWithResiliency(node: CompiledNode, context: Context<TContext>): Promise<NodeResult> {
		const { maxRetries = 1, retryDelay = 0, timeout } = node.config
		let lastError: Error | undefined
		const executionId = context.getMetadata().executionId

		await this.eventBus.emit('node:start', { executionId, nodeId: node.id })
		const startTime = Date.now()

		try {
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					// Check for cancellation before each attempt
					if (context.getMetadata().signal?.aborted) {
						throw new Error('Operation aborted.') // Generic error to be caught and converted
					}
					const executionPromise = this.executeNode(node, context)
					const result = timeout
						? await Promise.race([
								executionPromise,
								new Promise<NodeResult>((_, reject) =>
									setTimeout(() => reject(new Error('Node execution timed out')), timeout),
								),
							])
						: await executionPromise

					if (result.error) {
						throw new Error(result.error.message) // Propagate node-level error for retry
					}

					await this.eventBus.emit('node:finish', {
						executionId,
						nodeId: node.id,
						duration: Date.now() - startTime,
						result,
					})
					return result
				}
				catch (error) {
					// If it's an abort, break the retry loop and re-throw.
					if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Operation aborted.')) {
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

			// All retries failed, attempt fallback
			await this.eventBus.emit('node:fallback', { executionId, nodeId: node.id, error: lastError?.message })
			if (node.fallbackImplementation) {
				const fallbackResult = await this.executeNode(
					{ ...node, implementation: node.fallbackImplementation },
					context,
				)
				await this.eventBus.emit('node:finish', {
					executionId,
					nodeId: node.id,
					duration: Date.now() - startTime,
					result: fallbackResult,
					isFallback: true,
				})
				return fallbackResult
			}

			// No fallback, throw the final error
			throw lastError
		}
		catch (error) {
			// Convert abort-style errors into the official CancelledWorkflowError
			if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Operation aborted.')) {
				throw new CancelledWorkflowError('Node execution cancelled.', executionId)
			}
			const finalError = error instanceof Error ? error : new Error('Unknown error')
			await this.eventBus.emit('node:error', {
				executionId,
				nodeId: node.id,
				duration: Date.now() - startTime,
				error: finalError.message,
			})
			throw new NodeExecutionError(finalError.message, node.id, context.getMetadata().blueprintId, executionId, finalError)
		}
	}

	/**
	 * Execute a single node's core logic.
	 */
	private async executeNode(
		node: CompiledNode,
		context: Context<TContext>,
	): Promise<NodeResult> {
		// Built-in structural nodes
		if (node.implementation === 'parallel-container') {
			return this._executeParallelContainer(node, context)
		}
		if (node.implementation === 'batch-processor') {
			return this._executeBatchProcessor(node, context)
		}
		if (node.implementation === 'loop-controller') {
			return this._executeLoopController(node, context)
		}
		// Handle sub-workflows
		if (node.implementation === 'subflow') {
			return this._executeSubflow(node, context)
		}

		// Standard node implementation (function or class)
		const nodeContext: NodeContext<TContext> = {
			get: context.get.bind(context),
			set: context.set.bind(context),
			has: context.has.bind(context),
			keys: context.keys.bind(context),
			values: context.values.bind(context),
			entries: context.entries.bind(context),
			input: context.get('input' as any),
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

		// Create a scoped context for the sub-workflow
		const subContextData: Record<string, any> = {}
		// Apply input mappings
		for (const [subKey, parentKey] of Object.entries(inputs)) {
			if (parentContext.has(parentKey as any)) {
				subContextData[subKey] = parentContext.get(parentKey as any)
			}
		}

		// Run the sub-workflow. It inherits the signal from the parent.
		const subResult = await this.runtime.run(
			subBlueprint,
			subContextData as Partial<TContext>,
			this.functionRegistry, // Pass the combined function registry
			parentContext.getMetadata().signal,
		)

		if (subResult.metadata.status === 'failed' || subResult.metadata.status === 'cancelled') {
			// Propagate the error
			throw subResult.metadata.error?.details
		}

		const subFinalContext = createContext(subResult.context, parentContext.getMetadata())

		// Apply output mappings
		for (const [parentKey, subKey] of Object.entries(outputs)) {
			if (subFinalContext.has(subKey as any)) {
				parentContext.set(parentKey as any, subFinalContext.get(subKey as any))
			}
		}

		// The final 'input' of the sub-workflow's context becomes the output of this node
		// But if the sub-workflow has a specific output node, we should return that
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

		// Use shared context for all branches to allow communication between them
		const promises = branchNodes.map(branchNode =>
			new ExecutableFlow(branchNode, this.nodeMap, this.runtime, this.functionRegistry).execute(context.createScope()),
		)

		const settledResults = await Promise.allSettled(promises)

		const outputs: any[] = []
		for (const result of settledResults) {
			if (result.status === 'rejected') {
				// If any branch fails, the whole container fails.
				throw result.reason
			}
			const branchContext = result.value
			// The conventional output of a branch is the final value of the 'input' key.
			outputs.push(branchContext.get('input' as any))

			// Merge the results from the branch scope back into the main context.
			context.merge(branchContext)
		}

		// The output of the container is an array of the outputs of its branches.
		return { output: outputs }
	}

	/**
	 * Executes a batch processor that processes items from an array.
	 */
	private async _executeBatchProcessor(node: CompiledNode, context: Context<TContext>): Promise<NodeResult> {
		const { concurrency = 1, workerNodeId } = node.params
		const inputArray = context.get('input' as any)

		if (!workerNodeId || typeof workerNodeId !== 'string') {
			return { error: { message: `Batch processor node '${node.id}' requires a 'workerNodeId' parameter.` } }
		}
		const workerNode = this.nodeMap.get(workerNodeId)
		if (!workerNode) {
			return { error: { message: `Batch processor could not find worker node with ID '${workerNodeId}'.` } }
		}

		if (!Array.isArray(inputArray)) {
			return { error: { message: 'Batch processor expects an array as input' } }
		}

		const results: any[] = []
		const semaphore = new Semaphore(concurrency)
		const promises = inputArray.map((item: any) =>
			semaphore.acquire(async () => {
				// Each item gets its own scope with the item set as 'input'
				const itemContext = context.createScope({ input: item })
				const itemResult = await this._processBatchItem(workerNode, itemContext)

				// After execution, merge any state changes from the item's scope back to the main context.
				context.merge(itemContext)
				return itemResult
			}),
		)

		const settledResults = await Promise.allSettled(promises)

		for (const result of settledResults) {
			if (result.status === 'rejected') {
				throw result.reason // Fail the whole batch if one item fails
			}
			if (result.value.error) {
				return result.value // Propagate error from worker
			}
			results.push(result.value.output)
		}

		return { output: results }
	}

	/**
	 * Process a single item in a batch by executing the specified worker node.
	 */
	private async _processBatchItem(workerNode: CompiledNode, context: Context<TContext>): Promise<NodeResult> {
		// Since a batch worker is a self-contained execution, we create a new
		// mini-flow for it to run to completion.
		const flow = new ExecutableFlow(workerNode, this.nodeMap, this.runtime, this.functionRegistry)
		const finalContext = await flow.execute(context)
		// The result of the batch item is the final 'input' value in its context.
		return { output: finalContext.get('input' as any) }
	}

	/**
	 * Executes a loop controller that manages iteration logic.
	 */
	private async _executeLoopController(node: CompiledNode, context: Context<TContext>): Promise<NodeResult> {
		const { maxIterations = 100, condition } = node.params

		// Get current iteration count from context
		const iterations = context.get('loop_iterations' as any) || 0

		// Check max iterations FIRST. This prevents running the N+1th iteration.
		if (iterations >= maxIterations) {
			return { action: 'break' }
		}

		// Increment iteration count for the next run
		(context as any).set('loop_iterations', iterations + 1)

		// Check condition if provided
		if (condition) {
			const evalContext = {
				...context.toJSON(),
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
		// Special handling for batch processor: it's a container. Its "next" node
		// is the one connected *from* the container, not the worker inside it.
		if (currentNode.implementation === 'batch-processor') {
			// The successor is any node connected from the batch processor that isn't the worker.
			const workerId = currentNode.params.workerNodeId
			const successorEdge = currentNode.nextNodes.find(edge => edge.node.id !== workerId)
			return successorEdge ? [successorEdge.node] : []
		}

		if (!currentNode.nextNodes || currentNode.nextNodes.length === 0) {
			return []
		}

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
			// Simple transformation evaluator - supports basic expressions
			// For example: "input * 2", "input.toUpperCase()", "input.map(x => x * 2)"
			const transformContext = {
				input: output,
				context: context.toJSON(),
			}

			// Use Function constructor for safe evaluation
			const transformFn = new Function('input', 'context', `return ${transform}`) // eslint-disable-line no-new-func
			return transformFn(transformContext.input, transformContext.context)
		}
		catch (error) {
			throw new Error(`Failed to apply transform "${transform}": ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	}
}

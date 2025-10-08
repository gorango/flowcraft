import type { Context } from './context.js'
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
} from './types.js'
import { randomUUID } from 'node:crypto'
import { createContext } from './context.js'
import { NodeExecutionError } from './errors.js'

/** A default event bus that does nothing, ensuring the framework is silent by default. */
class NullEventBus implements IEventBus {
	emit() { /* no-op */ }
}

/** A default serializer using standard JSON, keeping the core dependency-free. */
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
	evaluate(condition: string, context: Record<string, any>): boolean {
		// A more robust regex that defines the left-hand side more strictly.
		const parts = condition.match(/^([\w.]+)\s*([<>=!]{1,3})\s*(.*)$/s)
		if (!parts) {
			// Fallback for simple truthy checks like "result.isAdmin"
			return !!this.resolvePath(condition.trim(), context)
		}

		const [, leftPath, operator, rightStr] = parts
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
 * The unified runtime engine for Flowcraft V2
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

	constructor(options: RuntimeOptions) {
		this.registry = options.registry
		this.dependencies = options.dependencies || {}
		this.defaultNodeConfig = options.defaultNodeConfig || {}
		this.environment = options.environment || 'development'
		this.eventBus = options.eventBus || new NullEventBus()
		this.conditionEvaluator = options.conditionEvaluator || new DefaultConditionEvaluator()
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
	): Promise<WorkflowResult<TContext>> {
		const startTime = new Date()
		const executionId = randomUUID()
		let finalContext: Context<TContext> | undefined
		let status: 'completed' | 'failed' = 'completed'
		let finalError: NodeExecutionError | undefined

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
			}
			const context = createContext<TContext>(initialContext, metadata)
			finalContext = await executableFlow.execute(context)
		}
		catch (error) {
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
							nodeId: finalError.nodeId,
							message: finalError.message,
							details: finalError,
						}
					: undefined,
			},
		}

		await this.eventBus.emit('workflow:finish', result)

		if (status === 'failed' && finalError) {
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
				nextNodes: [],
			}
			nodeMap.set(nodeDef.id, compiledNode)
		}

		// second pass: wire up the edges
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
		}

		// find the start node (node with no incoming edges)
		const startNode = this.findStartNode(nodeMap, blueprint.edges)

		return new ExecutableFlow<TContext>(startNode, nodeMap, this)
	}

	/**
	 * Find the implementation for a given node definition
	 */
	private findNodeImplementation(
		nodeDef: Pick<NodeDefinition, 'id' | 'uses'>,
		functionRegistry: Map<string, any>,
	): any {
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
		edges: any[],
	): CompiledNode {
		const targetNodes = new Set(edges.map(e => e.target))

		// Identify all nodes that are part of a parallel branch, as they are not valid start nodes.
		const branchNodes = new Set<string>()
		for (const node of nodeMap.values()) {
			if (node.implementation === 'parallel-container' && Array.isArray(node.params.branches)) {
				for (const branchId of node.params.branches) {
					branchNodes.add(branchId)
				}
			}
		}

		const startNodes = Array.from(nodeMap.values()).filter(
			node => !targetNodes.has(node.id) && !branchNodes.has(node.id),
		)

		if (startNodes.length === 0 && nodeMap.size > 0) {
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
			nextNodes: [], // The container's output is not wired to a next step by default
		}
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

	constructor(
		startNode: CompiledNode,
		nodeMap: Map<string, CompiledNode>,
		runtime: FlowcraftRuntime<TContext>,
	) {
		this.startNode = startNode
		this.nodeMap = nodeMap
		this.runtime = runtime
		this.eventBus = runtime.getEventBus()
		this.conditionEvaluator = runtime.getConditionEvaluator()
	}

	/**
	 * Execute the flow
	 */
	async execute(context: Context<TContext>): Promise<Context<TContext>> {
		let currentNode: CompiledNode | undefined = this.startNode
		let currentContext = context

		while (currentNode) {
			// update metadata for the current node
			currentContext = currentContext.withMetadata({
				currentNodeId: currentNode.id,
			})

			// execute the node with resiliency
			const result = await this._executeNodeWithResiliency(currentNode, currentContext)

			// determine next node based on result
			currentNode = await this.getNextNode(currentNode, result, currentContext)

			// update context with result - the output becomes the input for the next node
			if (result.output !== undefined) {
				currentContext.set('input' as any, result.output)
			}
		}

		return currentContext
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

		// Standard node implementation (function or class)
		const nodeContext: NodeContext<TContext> = {
			get: (key: keyof TContext) => context.get(key as string) as TContext[keyof TContext],
			set: (key: keyof TContext, value: TContext[keyof TContext]) => context.set(key as string, value),
			has: (key: keyof TContext) => context.has(key as string),
			keys: () => context.keys() as (keyof TContext)[],
			values: () => context.values() as any[],
			entries: () => context.entries() as [keyof TContext, any][],
			input: context.get('input' as any),
			metadata: context.getMetadata(),
			dependencies: this.runtime.getDependencies(),
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
	 * Executes the branches of a parallel container and aggregates results.
	 */
	private async _executeParallelContainer(node: CompiledNode, context: Context<TContext>): Promise<NodeResult> {
		const branchIds = node.params.branches as string[] | undefined
		if (!branchIds) {
			return { error: { message: 'Parallel container is missing "branches" in its params' } }
		}

		const branchNodes = branchIds.map(id => this.nodeMap.get(id)).filter(Boolean) as CompiledNode[]

		const promises = branchNodes.map(branchNode =>
			// Execute each branch as a new, independent "mini-flow" starting from that node.
			// Each branch gets a clean scope of the context to avoid side-effect race conditions.
			new ExecutableFlow(branchNode, this.nodeMap, this.runtime).execute(context.createScope()),
		)

		const settledResults = await Promise.allSettled(promises)

		const outputs: any[] = []
		for (const result of settledResults) {
			if (result.status === 'rejected') {
				// If any branch fails, the whole container fails.
				throw result.reason
			}
			// The final "input" value in the context of the branch is its result.
			outputs.push(result.value.get('input' as any))
		}

		// The output of the container is an array of the outputs of its branches.
		return { output: outputs }
	}

	/**
	 * Get the next node based on execution result and conditional edges.
	 */
	private async getNextNode(
		currentNode: CompiledNode,
		result: NodeResult,
		context: Context<TContext>,
	): Promise<CompiledNode | undefined> {
		if (!currentNode.nextNodes || currentNode.nextNodes.length === 0) {
			return undefined
		}

		const candidates = currentNode.nextNodes

		// 1. Find a direct match on the node's returned action
		if (result.action) {
			const actionMatch = candidates.find(edge => edge.action === result.action)
			if (actionMatch) {
				return actionMatch.node
			}
		}

		// 2. Evaluate conditional edges
		const conditionalEdges = candidates.filter(edge => edge.condition)
		for (const edge of conditionalEdges) {
			// Create the context for the evaluator
			const evalContext = {
				...context.toJSON(), // Make all context values available
				result: result.output, // Make the direct output of the node available as `result`
			}
			if (await this.conditionEvaluator.evaluate(edge.condition!, evalContext)) {
				return edge.node
			}
		}

		// 3. Fallback to the default edge (no action, no condition)
		return candidates.find(edge => !edge.action && !edge.condition)?.node
	}
}

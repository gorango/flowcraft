import type { Context } from './context.js'
import type {
	ExecutionMetadata,
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
	private serializer: ISerializer

	constructor(options: RuntimeOptions) {
		this.registry = options.registry
		this.dependencies = options.dependencies || {}
		this.defaultNodeConfig = options.defaultNodeConfig || {}
		this.environment = options.environment || 'development'
		this.eventBus = options.eventBus || new NullEventBus()
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
			// get or compile the executable flow
			const executableFlow = await this.getOrCompileFlow(blueprint, functionRegistry)

			// create execution context
			const metadata: ExecutionMetadata = {
				executionId,
				blueprintId: blueprint.id,
				currentNodeId: '', // will be set during execution
				startedAt: startTime,
				environment: this.environment,
			}

			const context = createContext<TContext>(initialContext, metadata)

			// execute the flow
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
		finally {
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
						? { nodeId: finalError.nodeId, message: finalError.message, details: finalError }
						: undefined,
				},
			}

			await this.eventBus.emit('workflow:finish', result)
			if (status === 'failed' && finalError) {
				// Re-throw the error after logging to allow for programmatic catching
				throw finalError
			}
			return result
		}
	}

	/**
	 * Get a compiled flow from cache or compile it
	 */
	private async getOrCompileFlow(blueprint: WorkflowBlueprint, functionRegistry?: Map<string, any>): Promise<ExecutableFlow<TContext>> {
		// check cache first
		const cached = this.compiledFlows.get(blueprint.id)
		if (cached) {
			return cached
		}

		// compile the blueprint
		const compiled = await this.compileBlueprint(blueprint, functionRegistry)

		// cache it
		this.compiledFlows.set(blueprint.id, compiled)

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
	 * Find the starting node for execution
	 */
	private findStartNode(
		nodeMap: Map<string, CompiledNode>,
		edges: any[],
	): CompiledNode {
		const targetNodes = new Set(edges.map(e => e.target))
		const startNodes = Array.from(nodeMap.values()).filter(node => !targetNodes.has(node.id))

		if (startNodes.length === 0 && nodeMap.size > 0) {
			throw new Error('No start node found - all nodes have incoming edges (cycle detected).')
		}

		return startNodes[0]
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

	/**
	 * Get the configured event bus
	 */
	getEventBus(): IEventBus {
		return this.eventBus
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

	constructor(
		startNode: CompiledNode,
		nodeMap: Map<string, CompiledNode>,
		runtime: FlowcraftRuntime<TContext>,
	) {
		this.startNode = startNode
		this.nodeMap = nodeMap
		this.runtime = runtime
		this.eventBus = runtime.getEventBus()
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
			currentNode = this.getNextNode(currentNode, result)

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
		const { maxRetries = 1, retryDelay = 0, timeout, fallback } = node.config
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

		throw new Error(`Unknown node implementation type for ${node.id}`)
	}

	/**
	 * Get the next node based on execution result
	 */
	private getNextNode(currentNode: CompiledNode, result: NodeResult): CompiledNode | undefined {
		if (!currentNode.nextNodes || currentNode.nextNodes.length === 0) {
			return undefined
		}

		// find edge that matches a returned action
		if (result.action) {
			const matchingEdge = currentNode.nextNodes.find(edge => edge.action === result.action)
			if (matchingEdge) {
				return matchingEdge.node
			}
		}

		// if no action matches or no action was returned, find the default edge (no action or condition)
		const defaultEdge = currentNode.nextNodes.find(edge => !edge.action && !edge.condition)
		return defaultEdge?.node
	}
}

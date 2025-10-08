import type { Context } from './context.js'
import type {
	ExecutionMetadata,
	NodeContext,
	NodeRegistry,
	NodeResult,
	RuntimeDependencies,
	RuntimeOptions,
	WorkflowBlueprint,
	WorkflowResult,
} from './types.js'
import { randomUUID } from 'node:crypto'
import { createContext } from './context.js'

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

	constructor(options: RuntimeOptions) {
		this.registry = options.registry
		this.dependencies = options.dependencies || {}
		this.defaultNodeConfig = options.defaultNodeConfig || {}
		this.environment = options.environment || 'development'
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
			const finalContext = await executableFlow.execute(context)

			const endTime = new Date()
			return {
				context: finalContext.toJSON() as any,
				metadata: {
					executionId,
					blueprintId: blueprint.id,
					startedAt: startTime,
					completedAt: endTime,
					duration: endTime.getTime() - startTime.getTime(),
					status: 'completed',
				},
			}
		}
		catch (error) {
			const endTime = new Date()
			const errorMessage = error instanceof Error ? error.message : 'Unknown error'

			// try to extract node ID from error message
			let nodeId = 'unknown'
			const nodeMatch = errorMessage.match(/Node (\w+) failed:/)
			if (nodeMatch) {
				nodeId = nodeMatch[1]
			}

			return {
				context: initialContext as any,
				metadata: {
					executionId,
					blueprintId: blueprint.id,
					startedAt: startTime,
					completedAt: endTime,
					duration: endTime.getTime() - startTime.getTime(),
					status: 'failed',
					error: {
						nodeId,
						message: errorMessage,
						details: error,
					},
				},
			}
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
			const compiledNode: CompiledNode = {
				id: nodeDef.id,
				implementation,
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
		nodeDef: any,
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
		throw new Error(`Node implementation '${nodeDef.uses}' not found`)
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

		if (startNodes.length === 0) {
			throw new Error('No start node found - all nodes have incoming edges')
		}
		if (startNodes.length > 1) {
			// this is a valid scenario for parallel workflows, so we don't throw an error.
			// the execution logic will handle it. We can pick the first one as a nominal start.
		}

		return startNodes[0]
	}

	/**
	 * Get runtime dependencies
	 */
	getDependencies(): RuntimeDependencies {
		return this.dependencies
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

	constructor(
		startNode: CompiledNode,
		nodeMap: Map<string, CompiledNode>,
		runtime: FlowcraftRuntime<TContext>,
	) {
		this.startNode = startNode
		this.nodeMap = nodeMap
		this.runtime = runtime
	}

	/**
	 * Execute the flow
	 */
	async execute(context: Context<TContext>): Promise<Context<TContext>> {
		let currentNode: CompiledNode | undefined = this.startNode
		let currentContext = context

		while (currentNode) {
			// update metadata
			currentContext = currentContext.withMetadata({
				currentNodeId: currentNode.id,
			})

			// execute the node
			const result = await this.executeNode(currentNode, currentContext)

			if (result.error) {
				throw new Error(`Node ${currentNode.id} failed: ${result.error.message}`)
			}

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
	 * Execute a single node
	 */
	private async executeNode(
		node: CompiledNode,
		context: Context<TContext>,
	): Promise<NodeResult> {
		try {
			// create the plain object accessor for the node implementation
			const nodeContext: NodeContext<TContext> = {
				get: (key: keyof TContext) => context.get(key as string) as TContext[keyof TContext],
				set: (key: keyof TContext, value: TContext[keyof TContext]) => context.set(key as string, value),
				has: (key: keyof TContext) => context.has(key as string),
				keys: () => context.keys() as (keyof TContext)[],
				values: () => context.values() as TContext[],
				entries: () => context.entries() as [keyof TContext, TContext][],
				input: context.get('input' as any),
				metadata: context.getMetadata(),
				dependencies: this.runtime.getDependencies(),
			}

			// execute based on implementation type
			if (node.implementation === 'subflow') {
				return await this.executeSubflow(node, context)
			}
			else if (node.implementation === 'parallel-container') {
				return await this.executeParallelContainer(node, context)
			}
			else if (node.implementation === 'batch-processor') {
				return await this.executeBatchProcessor(node, context)
			}
			else if (node.implementation === 'loop-controller') {
				return await this.executeLoopController(node, context)
			}
			else if (typeof node.implementation === 'function') {
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
		catch (error) {
			return {
				error: {
					message: error instanceof Error ? error.message : 'Unknown error',
					details: error,
				},
			}
		}
	}

	/**
	 * Execute a parallel container node
	 */
	private async executeParallelContainer(node: CompiledNode, context: Context<TContext>): Promise<NodeResult> {
		const params = node.params || {}
		const sources = params.sources || []
		const strategy = params.strategy || 'all'

		try {
			const sourceNodes = sources
				.map((sourceId: string) => this.nodeMap.get(sourceId))
				.filter((n: CompiledNode | undefined): n is CompiledNode => n !== undefined)

			if (sourceNodes.length === 0) {
				return { output: [] }
			}

			const promises = sourceNodes.map(async (sourceNode: any) => {
				const branchContext = context.createScope()
				const result = await this.executeNode(sourceNode, branchContext)
				return { nodeId: sourceNode.id, result }
			})

			const results = await Promise.all(promises)

			if (strategy === 'all') {
				const firstError = results.find(r => r.result.error)
				if (firstError) {
					return {
						error: {
							message: `Parallel execution failed in node '${firstError.nodeId}': ${firstError.result.error?.message}`,
							details: firstError.result.error?.details,
						},
					}
				}
			}

			switch (strategy) {
				case 'all':
					return { output: results.map(r => r.result) }
				case 'any': {
					const successful = results.find(r => !r.result.error)
					return successful ? { output: successful.result } : { error: { message: 'All parallel executions failed' } }
				}
				case 'race':
					return { output: results[0]?.result }
				default:
					return { error: { message: `Unknown parallel strategy: ${strategy}` } }
			}
		}
		catch (error) {
			return {
				error: {
					message: `Parallel execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				},
			}
		}
	}

	/**
	 * Execute a batch processor node
	 */
	private async executeBatchProcessor(node: CompiledNode, context: Context<TContext>): Promise<NodeResult> {
		const params = node.params || {}
		const batchSize = params.batchSize || 10
		const concurrency = params.concurrency || 1
		const timeout = params.timeout
		const input = context.get('input' as any)

		try {
			if (!Array.isArray(input)) {
				return { error: { message: 'Batch processor requires array input' } }
			}

			const batches: any[][] = []
			for (let i = 0; i < input.length; i += batchSize) {
				batches.push(input.slice(i, i + batchSize))
			}

			const results: any[] = []
			for (let i = 0; i < batches.length; i += concurrency) {
				const batchPromises = batches.slice(i, i + concurrency).map(async (batch) => {
					const batchContext = context.createScope({ input: batch } as any)
					const nextNode = node.nextNodes?.[0]?.node
					if (nextNode) {
						return await this.executeNode(nextNode, batchContext)
					}
					return { output: batch }
				})

				const batchResults = await Promise.all(batchPromises)
				results.push(...batchResults)

				if (timeout && (Date.now() - (context.getMetadata().startedAt?.getTime() || 0)) > timeout) {
					return { error: { message: 'Batch processing timeout' } }
				}
			}

			return { output: results }
		}
		catch (error) {
			return {
				error: {
					message: `Batch processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				},
			}
		}
	}

	/**
	 * Execute a loop controller node
	 */
	private async executeLoopController(node: CompiledNode, context: Context<TContext>): Promise<NodeResult> {
		const params = node.params || {}
		const maxIterations = params.maxIterations || 100
		const condition = params.condition
		const timeout = params.timeout

		try {
			let iterations = 0
			let iterationContext = context

			while (iterations < maxIterations) {
				if (timeout && (Date.now() - (context.getMetadata().startedAt?.getTime() || 0)) > timeout) {
					return { action: 'break', output: { iterations, reason: 'timeout' } }
				}

				if (condition) {
					const nodeContextProxy = { get: (key: any) => iterationContext.get(key) }
					const conditionMet = await this.evaluateCondition(condition, nodeContextProxy as any)
					if (!conditionMet) {
						return { action: 'break', output: { iterations, reason: 'condition_not_met' } }
					}
				}

				const loopBodyNode = node.nextNodes?.find(edge => edge.action === 'continue')?.node
				if (loopBodyNode) {
					const result = await this.executeNode(loopBodyNode, iterationContext)
					if (result.error) {
						return { action: 'break', error: result.error }
					}

					iterationContext = iterationContext.createScope({ input: result.output } as any)

					if (result.action === 'break') {
						return { action: 'break', output: iterationContext.get('input' as any) }
					}
				}
				else {
					// no loop body, break to prevent infinite loop
					return { action: 'break', output: { iterations, reason: 'no_loop_body' } }
				}

				iterations++
			}

			return { action: 'break', output: { iterations, reason: 'max_iterations_reached' } }
		}
		catch (error) {
			return {
				action: 'break',
				error: {
					message: `Loop execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				},
			}
		}
	}

	/**
	 * Evaluate a condition expression
	 */
	private async evaluateCondition(condition: string, context: NodeContext<TContext>): Promise<boolean> {
		try {
			const parts = condition.split(' ')
			if (parts.length === 1) {
				return Boolean(context.get(parts[0] as keyof TContext))
			}

			if (parts.length === 3) {
				const left = context.get(parts[0] as keyof TContext)
				const operator = parts[1]
				const rightStr = parts[2]
				const right = !isNaN(Number.parseFloat(rightStr)) ? Number.parseFloat(rightStr) : rightStr // eslint-disable-line unicorn/prefer-number-properties

				switch (operator) {
					case '>': return (left as any) > right
					case '<': return (left as any) < right
					case '>=': return (left as any) >= right
					case '<=': return (left as any) <= right
					case '==': return (left as any) == right // eslint-disable-line eqeqeq
					case '===': return (left as any) === right
				}
			}
			return false
		}
		catch {
			return false
		}
	}

	/**
	 * Execute a subflow node
	 */
	private async executeSubflow(node: CompiledNode, context: Context<TContext>): Promise<NodeResult> {
		const params = node.params || {}
		const subBlueprintId = params.blueprintId

		if (!subBlueprintId) {
			return { error: { message: 'Subflow node missing blueprintId parameter' } }
		}

		const subBlueprint = this.runtime.getBlueprint(subBlueprintId)
		if (!subBlueprint) {
			return { error: { message: `Subflow blueprint '${subBlueprintId}' not found` } }
		}

		try {
			const inputMapping = (params.inputs || {}) as Record<string, string>
			const outputMapping = (params.outputs || {}) as Record<string, string>
			const subflowInitialContext: Record<string, any> = {}

			for (const [subflowKey, parentKey] of Object.entries(inputMapping)) {
				const value = context.get(parentKey as keyof TContext)
				if (value !== undefined) {
					subflowInitialContext[subflowKey] = value
				}
			}

			const subflowResult = await this.runtime.run(subBlueprint, subflowInitialContext as any)

			if (subflowResult.metadata.status === 'failed') {
				return { error: { message: `Subflow '${subBlueprintId}' failed: ${subflowResult.metadata.error?.message}` } }
			}

			for (const [parentKey, subflowKey] of Object.entries(outputMapping)) {
				const value = (subflowResult.context as any)[subflowKey]
				if (value !== undefined) {
					context.set(parentKey as keyof TContext, value)
				}
			}

			return {
				output: subflowResult.context as any,
				metadata: { subflowExecutionId: subflowResult.metadata.executionId },
			}
		}
		catch (error) {
			return {
				error: {
					message: `Subflow execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				},
			}
		}
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

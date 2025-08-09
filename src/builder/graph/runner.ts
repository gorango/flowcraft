import type { Context } from '../../context'
import type { IExecutor } from '../../executors/types'
import type { RunOptions } from '../../types'
import type { AbstractNode } from '../../workflow'
import type { GraphNode, NodeRegistry, TypedNodeRegistry, WorkflowBlueprint } from './types'
import { InMemoryExecutor } from '../../executors/in-memory'
import { DEFAULT_ACTION } from '../../types'
import { Flow } from '../../workflow'
import { ConditionalJoinNode, InputMappingNode, OutputMappingNode, ParallelBranchContainer, SubWorkflowContainerNode } from './internal-nodes'

/**
 * An execution engine that hydrates a runnable `Flow` from a serializable
 * `WorkflowBlueprint` and runs it. This is the recommended executor for
 *  distributed systems where the workflow is built once and executed many times by workers.
 */
export class BlueprintExecutor implements IExecutor {
	public readonly flow: Flow
	public readonly nodeMap: Map<string, AbstractNode>
	private readonly registry: NodeRegistry

	constructor(
		private blueprint: WorkflowBlueprint,
		registry: NodeRegistry | TypedNodeRegistry<any, any>,
		private nodeOptionsContext: Record<string, any> = {},
	) {
		this.registry = registry instanceof Map ? registry : new Map(Object.entries(registry))

		if (!this.registry.has('__internal_input_mapper__'))
			this.registry.set('__internal_input_mapper__', InputMappingNode as any)
		if (!this.registry.has('__internal_output_mapper__'))
			this.registry.set('__internal_output_mapper__', OutputMappingNode as any)
		if (!this.registry.has('__internal_sub_workflow_container__'))
			this.registry.set('__internal_sub_workflow_container__', SubWorkflowContainerNode as any)
		if (!this.registry.has('__internal_conditional_join__'))
			this.registry.set('__internal_conditional_join__', ConditionalJoinNode as any)
		if (!this.registry.has('__internal_parallel_container__'))
			this.registry.set('__internal_parallel_container__', ParallelBranchContainer as any)

		this.nodeMap = this._createNodeMap(blueprint.nodes)
		this._wireGraph()
		const startNode = this.nodeMap.get(blueprint.startNodeId)
		if (!startNode)
			throw new Error(`Blueprint start node with ID '${blueprint.startNodeId}' not found in hydrated node map.`)

		this.flow = new Flow(startNode)
		this._populateContainers()
	}

	private _populateContainers(): void {
		for (const node of this.nodeMap.values()) {
			if (node instanceof ParallelBranchContainer)
				node.nodesToRun = Array.from(node.successors.values()).flat()
		}
	}

	/**
	 * Retrieves a hydrated node instance from the blueprint by its ID.
	 * This is useful for workers that need to execute a specific node from the graph.
	 * @param nodeId The ID of the node to retrieve.
	 * @returns The `AbstractNode` instance if found, otherwise `undefined`.
	 */
	public getNode(nodeId: string): AbstractNode | undefined {
		return this.nodeMap.get(nodeId)
	}

	/**
	 * Instantiates all node objects from the blueprint's definition.
	 * @private
	 */
	private _createNodeMap(nodes: GraphNode[]): Map<string, AbstractNode> {
		const nodeMap = new Map<string, AbstractNode>()
		for (const graphNode of nodes) {
			const NodeClass = this.registry.get(graphNode.type)
			if (!NodeClass)
				throw new Error(`BlueprintExecutor: Node type '${graphNode.type}' not found in registry.`)

			const nodeOptions = {
				...this.nodeOptionsContext,
				data: { ...graphNode.data, nodeId: graphNode.id },
			}
			const executableNode = new NodeClass(nodeOptions).withId(graphNode.id).withGraphData(graphNode)
			nodeMap.set(graphNode.id, executableNode)
		}
		return nodeMap
	}

	/**
	 * Wires the hydrated node instances together based on the blueprint's edges.
	 * @private
	 */
	private _wireGraph(): void {
		const edgeGroups = new Map<string, Map<any, AbstractNode[]>>()
		for (const edge of this.blueprint.edges) {
			const sourceId = edge.source
			const action = edge.action || DEFAULT_ACTION
			const targetNode = this.nodeMap.get(edge.target)
			if (!targetNode)
				continue // Should not happen in a valid blueprint

			if (!edgeGroups.has(sourceId))
				edgeGroups.set(sourceId, new Map())
			const sourceActions = edgeGroups.get(sourceId)!
			if (!sourceActions.has(action))
				sourceActions.set(action, [])
			sourceActions.get(action)!.push(targetNode)
		}

		for (const [sourceId, actions] of edgeGroups.entries()) {
			const sourceNode = this.nodeMap.get(sourceId)!
			for (const [action, successors] of actions.entries()) {
				for (const successor of successors)
					sourceNode.next(successor, action)
			}
		}
	}

	/**
	 * Executes the flow defined by the blueprint.
	 * @param flow The flow to execute.
	 * @param context The shared context for the workflow.
	 * @param options Runtime options, including a logger, abort controller, or initial params.
	 * @returns A promise that resolves with the final action of the workflow.
	 */
	public async run<T>(flow: Flow<any, T>, context: Context, options?: RunOptions): Promise<T> {
		if (flow !== this.flow) {
			throw new Error(
				'BlueprintExecutor is specialized and can only run the flow instance it was constructed with. '
				+ 'To run an arbitrary flow, use an InMemoryExecutor instance.',
			)
		}

		const inMemoryExecutor = new InMemoryExecutor()
		const finalOptions = { ...options, executor: this }
		return inMemoryExecutor.run(this.flow, context, finalOptions)
	}

	/**
	 * Determines the next node to execute based on the action returned by the current node.
	 * For distributed systems, this logic would live on the orchestrator.
	 * @internal
	 */
	public getNextNode(curr: AbstractNode, action: any): AbstractNode | undefined {
		// In a simple execution, we take the first successor for a given action.
		// Parallelism is handled by specific container nodes.
		return curr.successors.get(action)?.[0]
	}
}

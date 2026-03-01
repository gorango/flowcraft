import { analyzeBlueprint } from '../analysis'
import type { NodeDefinition, NodeResult, WorkflowBlueprint } from '../types'
import type { WorkflowState } from './state'

export interface ReadyNode {
	nodeId: string
	nodeDef: NodeDefinition
}

export class GraphTraverser {
	private frontier = new Set<string>()
	private allPredecessors: Map<string, Set<string>>
	private allSuccessors: Map<string, Set<string>>
	private dynamicBlueprint: WorkflowBlueprint
	private completedNodes = new Set<string>()
	private nodesInLoops: Map<string, Set<string>>

	constructor(blueprint: WorkflowBlueprint, isStrictMode: boolean = false) {
		this.dynamicBlueprint = structuredClone(blueprint) as WorkflowBlueprint
		this.allPredecessors = new Map<string, Set<string>>()
		this.allSuccessors = new Map<string, Set<string>>()
		this.nodesInLoops = new Map<string, Set<string>>()
		for (const node of this.dynamicBlueprint.nodes) {
			this.allPredecessors.set(node.id, new Set())
			this.allSuccessors.set(node.id, new Set())
		}
		for (const edge of this.dynamicBlueprint.edges) {
			this.getPredecessors(edge.target).add(edge.source)
		}
		for (const edge of this.dynamicBlueprint.edges) {
			this.getSuccessors(edge.source).add(edge.target)
		}
		const analysis = analyzeBlueprint(blueprint)
		this.filterNodesInLoops(blueprint)
		this.frontier = new Set(analysis.startNodeIds.filter((id) => !this.isFallbackNode(id)))
		if (this.frontier.size === 0 && analysis.cycles.length > 0 && !isStrictMode) {
			const uniqueStartNodes = new Set<string>()
			const cycleEntryPoints = new Set(blueprint.metadata?.cycleEntryPoints || [])
			for (const cycle of analysis.cycles) {
				if (cycle.length > 0) {
					const entryPoint = cycle.find((node) => cycleEntryPoints.has(node))
					uniqueStartNodes.add(entryPoint || cycle[0])
				}
			}
			this.frontier = new Set(uniqueStartNodes)
		}
	}

	/**
	 * Clears all nodes from the execution frontier.
	 */
	public clearFrontier(): void {
		this.frontier.clear()
	}

	/**
	 * Creates and initializes a GraphTraverser from a saved workflow state.
	 * This is the correct way to prepare a traverser for a `resume` operation.
	 * @param blueprint The workflow blueprint.
	 * @param state The workflow state being resumed.
	 * @returns A configured GraphTraverser instance.
	 */
	public static fromState(blueprint: WorkflowBlueprint, state: WorkflowState<any>): GraphTraverser {
		const traverser = new GraphTraverser(blueprint)

		// clear auto-populated frontier from constructor
		traverser.clearFrontier()

		// re-hydrate the set of completed nodes
		const completedNodes = state.getCompletedNodes()
		traverser.completedNodes = new Set(completedNodes)

		for (const node of traverser.dynamicBlueprint.nodes) {
			if (traverser.completedNodes.has(node.id)) continue

			const requiredPredecessors = traverser.allPredecessors.get(node.id)
			const joinStrategy = traverser.getJoinStrategy(node.id)

			// if no predecessors and not completed, it's a start node and should be in the frontier
			if (!requiredPredecessors || requiredPredecessors.size === 0) {
				traverser.frontier.add(node.id)
				continue
			}

			const completedPredecessors = [...requiredPredecessors].filter((p) => traverser.completedNodes.has(p))
			const isReady =
				joinStrategy === 'any'
					? completedPredecessors.length > 0
					: completedPredecessors.length === requiredPredecessors.size

			if (isReady) traverser.frontier.add(node.id)
		}

		return traverser
	}

	private isFallbackNode(nodeId: string): boolean {
		return this.dynamicBlueprint.nodes.some((n) => n.config?.fallback === nodeId)
	}

	private getJoinStrategy(nodeId: string): 'any' | 'all' {
		const node = this.dynamicBlueprint.nodes.find((n) => n.id === nodeId)
		const baseJoinStrategy = node?.config?.joinStrategy || 'all'
		return baseJoinStrategy
	}

	private filterNodesInLoops(blueprint: WorkflowBlueprint): void {
		blueprint.nodes.forEach((node) => {
			if (node.uses !== 'loop-controller') return

			const nextInLoopId = blueprint.edges.find((e) => e.source === node.id && e.action === 'continue')?.target
			if (!nextInLoopId) return

			const set: Set<string> = new Set()
			set.add(nextInLoopId)
			this.nodesInLoops.set(node.id, this.getAllLoopSuccessors(nextInLoopId, blueprint, set))
		})
	}

	private getAllLoopSuccessors(nodeId: string, blueprint: WorkflowBlueprint, set: Set<string>): Set<string> {
		this.getSuccessors(nodeId).forEach((successor) => {
			if (set.has(successor)) return
			const node = this.getNode(successor, blueprint)
			if (!node || node.uses === 'loop-controller') return
			set.add(successor)
			this.getAllLoopSuccessors(successor, blueprint, set)
		})
		return set
	}

	getReadyNodes(): ReadyNode[] {
		const readyNodes: ReadyNode[] = []
		for (const nodeId of this.frontier) {
			const nodeDef = this.dynamicBlueprint.nodes.find((n) => n.id === nodeId)
			if (nodeDef) {
				readyNodes.push({ nodeId, nodeDef })
			}
		}
		this.frontier.clear()
		return readyNodes
	}

	hasMoreWork(): boolean {
		return this.frontier.size > 0
	}

	markNodeCompleted(nodeId: string, result: NodeResult<any, any>, nextNodes: NodeDefinition[]): void {
		this.completedNodes.add(nodeId)

		if (result?.dynamicNodes && result.dynamicNodes.length > 0) {
			const gatherNodeId = result.output?.gatherNodeId
			for (const dynamicNode of result.dynamicNodes) {
				this.dynamicBlueprint.nodes.push(dynamicNode)
				this.allPredecessors.set(dynamicNode.id, new Set([nodeId]))
				if (gatherNodeId) {
					this.getPredecessors(gatherNodeId).add(dynamicNode.id)
				}
				this.frontier.add(dynamicNode.id)
			}
		}

		for (const node of nextNodes) {
			const joinStrategy = this.getJoinStrategy(node.id)
			if (joinStrategy !== 'any' && this.completedNodes.has(node.id)) continue

			const requiredPredecessors = this.getPredecessors(node.id)

			const isReady =
				joinStrategy === 'any'
					? requiredPredecessors.has(nodeId)
					: [...requiredPredecessors].every((p) => this.completedNodes.has(p))

			if (isReady) {
				this.frontier.add(node.id)
				// reset to uncompleted for all nodes in a loop
				if (node.uses === 'loop-controller') {
					this.getNodesInLoop(node.id).forEach((id) => {
						this.resetNodeCompletion(id)
					})
				}
			}
		}

		if (nextNodes.length === 0) {
			for (const [potentialNextId, predecessors] of this.allPredecessors) {
				if (predecessors.has(nodeId) && !this.completedNodes.has(potentialNextId)) {
					const joinStrategy = this.getJoinStrategy(potentialNextId)
					const isReady =
						joinStrategy === 'any'
							? predecessors.has(nodeId)
							: [...predecessors].every((p) => this.completedNodes.has(p))
					if (isReady) {
						this.frontier.add(potentialNextId)
						const node = this.getNode(potentialNextId, this.dynamicBlueprint)
						if (!node) continue
						// reset to uncompleted for all nodes in a loop
						if (node.uses === 'loop-controller') {
							this.getNodesInLoop(node.id).forEach((id) => {
								this.resetNodeCompletion(id)
							})
						}
					}
				}
			}
		}
	}

	getAllNodeIds(): Set<string> {
		return new Set(this.dynamicBlueprint.nodes.map((n) => n.id))
	}

	getFallbackNodeIds(): Set<string> {
		const fallbackNodeIds = new Set<string>()
		for (const node of this.dynamicBlueprint.nodes) {
			if (node.config?.fallback) fallbackNodeIds.add(node.config.fallback)
		}
		return fallbackNodeIds
	}

	getCompletedNodes(): Set<string> {
		return new Set(this.completedNodes)
	}

	getDynamicBlueprint(): WorkflowBlueprint {
		return this.dynamicBlueprint
	}

	getAllPredecessors(): Map<string, Set<string>> {
		return this.allPredecessors
	}

	getAllSuccessors(): Map<string, Set<string>> {
		return this.allSuccessors
	}

	getPredecessors(nodeId: string): Set<string> {
		const predecessors = this.allPredecessors.get(nodeId)
		if (!predecessors) return new Set()
		return predecessors
	}

	getSuccessors(nodeId: string): Set<string> {
		const successors = this.allSuccessors.get(nodeId)
		if (!successors) return new Set()
		return successors
	}

	getNodesInLoop(id: string): Set<string> {
		const loopNodes = this.nodesInLoops.get(id)
		if (!loopNodes) return new Set()
		return loopNodes
	}

	resetNodeCompletion(nodeId: string): void {
		this.completedNodes.delete(nodeId)
	}

	getNode(nodeId: string, blueprint: WorkflowBlueprint): NodeDefinition | undefined {
		return blueprint.nodes.find((n) => n.id === nodeId)
	}

	addDynamicNode(_nodeId: string, dynamicNode: NodeDefinition, predecessorId: string, gatherNodeId?: string): void {
		this.dynamicBlueprint.nodes.push(dynamicNode)
		this.allPredecessors.set(dynamicNode.id, new Set([predecessorId]))
		if (gatherNodeId) {
			this.allPredecessors.get(gatherNodeId)?.add(dynamicNode.id)
		}
		this.frontier.add(dynamicNode.id)
	}

	/**
	 * Manually adds a node ID back to the execution frontier.
	 * Used by orchestrators that need fine-grained control over steps.
	 * @param nodeId The ID of the node to add to the frontier.
	 */
	public addToFrontier(nodeId: string): void {
		this.frontier.add(nodeId)
	}
}

import { analyzeBlueprint } from '../analysis'
import type { NodeDefinition, NodeResult, WorkflowBlueprint } from '../types'

export interface ReadyNode {
	nodeId: string
	nodeDef: NodeDefinition
}

export class GraphTraverser {
	private frontier = new Set<string>()
	private allPredecessors: Map<string, Set<string>>
	private dynamicBlueprint: WorkflowBlueprint
	private completedNodes = new Set<string>()

	constructor(blueprint: WorkflowBlueprint, isStrictMode: boolean = false) {
		this.dynamicBlueprint = structuredClone(blueprint) as WorkflowBlueprint
		this.allPredecessors = new Map<string, Set<string>>()
		for (const node of this.dynamicBlueprint.nodes) {
			this.allPredecessors.set(node.id, new Set())
		}
		for (const edge of this.dynamicBlueprint.edges) {
			this.allPredecessors.get(edge.target)?.add(edge.source)
		}
		const analysis = analyzeBlueprint(blueprint)
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

	private isFallbackNode(nodeId: string): boolean {
		return this.dynamicBlueprint.nodes.some((n) => n.config?.fallback === nodeId)
	}

	private getEffectiveJoinStrategy(nodeId: string): 'any' | 'all' {
		const node = this.dynamicBlueprint.nodes.find((n) => n.id === nodeId)
		const baseJoinStrategy = node?.config?.joinStrategy || 'all'

		if (node?.uses === 'loop-controller') {
			return 'any'
		}

		const predecessors = this.allPredecessors.get(nodeId)
		if (predecessors) {
			for (const predecessorId of predecessors) {
				const predecessorNode = this.dynamicBlueprint.nodes.find((n) => n.id === predecessorId)
				if (predecessorNode?.uses === 'loop-controller') {
					return 'any'
				}
			}
		}

		return baseJoinStrategy
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

		if (result.dynamicNodes && result.dynamicNodes.length > 0) {
			const gatherNodeId = result.output?.gatherNodeId
			for (const dynamicNode of result.dynamicNodes) {
				this.dynamicBlueprint.nodes.push(dynamicNode)
				this.allPredecessors.set(dynamicNode.id, new Set([nodeId]))
				if (gatherNodeId) {
					this.allPredecessors.get(gatherNodeId)?.add(dynamicNode.id)
				}
				this.frontier.add(dynamicNode.id)
			}
		}

		for (const node of nextNodes) {
			const joinStrategy = this.getEffectiveJoinStrategy(node.id)
			if (joinStrategy !== 'any' && this.completedNodes.has(node.id)) continue

			const requiredPredecessors = this.allPredecessors.get(node.id)
			if (!requiredPredecessors) continue

			const isReady =
				joinStrategy === 'any'
					? requiredPredecessors.has(nodeId)
					: [...requiredPredecessors].every((p) => this.completedNodes.has(p))

			if (isReady) {
				this.frontier.add(node.id)
			}
		}

		if (nextNodes.length === 0) {
			for (const [potentialNextId, predecessors] of this.allPredecessors) {
				if (predecessors.has(nodeId) && !this.completedNodes.has(potentialNextId)) {
					const joinStrategy = this.getEffectiveJoinStrategy(potentialNextId)
					const isReady =
						joinStrategy === 'any'
							? predecessors.has(nodeId)
							: [...predecessors].every((p) => this.completedNodes.has(p))
					if (isReady) {
						this.frontier.add(potentialNextId)
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
}

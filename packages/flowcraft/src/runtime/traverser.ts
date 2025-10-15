import { analyzeBlueprint } from '../analysis'
import { CancelledWorkflowError } from '../errors'
import type { NodeResult, WorkflowBlueprint } from '../types'
import type { WorkflowState } from './state'
import type { IRuntime } from './types'

export class GraphTraverser<TContext extends Record<string, any>, TDependencies extends Record<string, any>> {
	private frontier = new Set<string>()
	private allPredecessors: Map<string, Set<string>>
	private dynamicBlueprint: WorkflowBlueprint

	constructor(
		blueprint: WorkflowBlueprint,
		private runtime: IRuntime<TContext, TDependencies>,
		private state: WorkflowState<TContext>,
		private functionRegistry: Map<string, any> | undefined,
		private executionId: string,
		private signal?: AbortSignal,
	) {
		this.dynamicBlueprint = JSON.parse(JSON.stringify(blueprint)) as WorkflowBlueprint
		this.allPredecessors = new Map<string, Set<string>>()
		for (const node of this.dynamicBlueprint.nodes) {
			this.allPredecessors.set(node.id, new Set())
		}
		for (const edge of this.dynamicBlueprint.edges) {
			this.allPredecessors.get(edge.target)?.add(edge.source)
		}
		const analysis = analyzeBlueprint(blueprint)
		this.frontier = new Set(analysis.startNodeIds.filter((id) => !this.isFallbackNode(id)))
		if (this.frontier.size === 0 && analysis.cycles.length > 0 && this.runtime.options.strict !== true) {
			const uniqueStartNodes = new Set<string>()
			for (const cycle of analysis.cycles) {
				if (cycle.length > 0) uniqueStartNodes.add(cycle[0])
			}
			this.frontier = new Set(uniqueStartNodes)
		}
	}

	private isFallbackNode(nodeId: string): boolean {
		return this.dynamicBlueprint.nodes.some((n) => n.config?.fallback === nodeId)
	}

	async traverse(): Promise<void> {
		try {
			this.signal?.throwIfAborted()
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError')
				throw new CancelledWorkflowError('Workflow cancelled')
			throw error
		}
		let iterations = 0
		const maxIterations = 10000
		while (this.frontier.size > 0) {
			if (++iterations > maxIterations) throw new Error('Traversal exceeded maximum iterations, possible infinite loop')

			try {
				this.signal?.throwIfAborted()
				const currentJobs = Array.from(this.frontier)
				this.frontier.clear()
				const promises = currentJobs.map((nodeId) =>
					this.runtime
						.executeNode(
							this.dynamicBlueprint,
							nodeId,
							this.state,
							this.allPredecessors,
							this.functionRegistry,
							this.executionId,
							this.signal,
						)
						.then((result: NodeResult) => ({
							status: 'fulfilled' as const,
							value: { nodeId, result },
						}))
						.catch((error: unknown) => ({
							status: 'rejected' as const,
							reason: { nodeId, error },
						})),
				)
				const settledResults = await Promise.all(promises)
				const completedThisTurn = new Set<string>()
				for (const promiseResult of settledResults) {
					if (promiseResult.status === 'rejected') {
						const { nodeId, error } = promiseResult.reason
						if (error instanceof CancelledWorkflowError) throw error
						this.state.addError(nodeId, error as Error)
						continue
					}
					const { nodeId, result } = promiseResult.value
					this.state.addCompletedNode(nodeId, result.output)
					completedThisTurn.add(nodeId)
					if (result._fallbackExecuted) this.state.markFallbackExecuted()
					await this.handleDynamicNodes(nodeId, result)
					if (!result._fallbackExecuted) {
						const matched = await this.runtime.determineNextNodes(
							this.dynamicBlueprint,
							nodeId,
							result,
							this.state.getContext(),
						)

						// If one of the next nodes is a loop controller, prioritize it to avoid ambiguity from manual cycle edges.
						const loopControllerMatch = matched.find((m) => m.node.uses === 'loop-controller')
						const finalMatched = loopControllerMatch ? [loopControllerMatch] : matched

						for (const { node, edge } of finalMatched) {
							const joinStrategy = node.config?.joinStrategy || 'all'
							if (joinStrategy !== 'any' && this.state.getCompletedNodes().has(node.id)) continue
							await this.runtime.applyEdgeTransform(edge, result, node, this.state.getContext(), this.allPredecessors)
							const requiredPredecessors = this.allPredecessors.get(node.id)
							if (!requiredPredecessors) continue
							const isReady =
								joinStrategy === 'any'
									? [...requiredPredecessors].some((p) => completedThisTurn.has(p))
									: [...requiredPredecessors].every((p) => this.state.getCompletedNodes().has(p))
							if (isReady) this.frontier.add(node.id)
						}
						if (matched.length === 0) {
							for (const [potentialNextId, predecessors] of this.allPredecessors) {
								if (predecessors.has(nodeId) && !this.state.getCompletedNodes().has(potentialNextId)) {
									const joinStrategy =
										this.dynamicBlueprint.nodes.find((n) => n.id === potentialNextId)?.config?.joinStrategy || 'all'
									const isReady =
										joinStrategy === 'any'
											? [...predecessors].some((p) => completedThisTurn.has(p))
											: [...predecessors].every((p) => this.state.getCompletedNodes().has(p))
									if (isReady) this.frontier.add(potentialNextId)
								}
							}
						}
					}
				}
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') {
					throw new CancelledWorkflowError('Workflow cancelled')
				}
				throw error
			}
		}
	}

	private async handleDynamicNodes(nodeId: string, result: NodeResult) {
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

	getDynamicBlueprint(): WorkflowBlueprint {
		return this.dynamicBlueprint
	}
}

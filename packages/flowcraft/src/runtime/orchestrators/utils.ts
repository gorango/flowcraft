import { FlowcraftError } from '../../errors'
import type { NodeDefinition, WorkflowBlueprint } from '../../types'
import type { NodeExecutionResult } from '../executors'
import type { WorkflowState } from '../state'
import type { GraphTraverser } from '../traverser'
import type { ExecutionServices, NodeExecutorFactory } from '../types'

export async function executeBatch(
	readyNodes: Array<{ nodeId: string; nodeDef: any }>,
	blueprint: WorkflowBlueprint,
	state: WorkflowState<any>,
	executorFactory: NodeExecutorFactory,
	services: ExecutionServices,
	maxConcurrency?: number,
): Promise<
	Array<
		| { status: 'fulfilled'; value: { nodeId: string; executionResult: NodeExecutionResult } }
		| { status: 'rejected'; reason: { nodeId: string; error: unknown } }
	>
> {
	const concurrency = maxConcurrency || readyNodes.length
	const results: Array<
		| { status: 'fulfilled'; value: { nodeId: string; executionResult: NodeExecutionResult } }
		| { status: 'rejected'; reason: { nodeId: string; error: unknown } }
	> = []

	for (let i = 0; i < readyNodes.length; i += concurrency) {
		const batch = readyNodes.slice(i, i + concurrency)
		const batchPromises = batch.map(async ({ nodeId }) => {
			try {
				const executor = executorFactory(blueprint)(nodeId)
				if (!executor) throw new Error(`No executor for node ${nodeId}`)
				const executionResult = await executor.execute(
					await services.resolveNodeInput(nodeId, blueprint, state.getContext()),
				)
				results.push({
					status: 'fulfilled' as const,
					value: { nodeId, executionResult },
				})
			} catch (error) {
				results.push({
					status: 'rejected' as const,
					reason: { nodeId, error },
				})
			}
		})

		await Promise.all(batchPromises)
	}

	return results
}

export async function processResults(
	settledResults: Array<
		| { status: 'fulfilled'; value: { nodeId: string; executionResult: NodeExecutionResult } }
		| { status: 'rejected'; reason: { nodeId: string; error: unknown } }
	>,
	traverser: GraphTraverser,
	state: WorkflowState<any>,
	services: ExecutionServices,
	blueprint: WorkflowBlueprint,
	executorFactory: NodeExecutorFactory,
	executionId?: string,
): Promise<void> {
	for (const promiseResult of settledResults) {
		if (promiseResult.status === 'rejected') {
			const { nodeId, error } = promiseResult.reason
			if (error instanceof FlowcraftError && error.message.includes('cancelled')) {
				throw error
			}
			state.addError(nodeId, error as Error)
			continue
		}

		const { nodeId, executionResult } = promiseResult.value

		if (executionResult.status === 'success') {
			const result = executionResult.result
			state.addCompletedNode(nodeId, result.output)
			if (result._fallbackExecuted) {
				state.markFallbackExecuted()
			}

			if (result.dynamicNodes && result.dynamicNodes.length > 0) {
				const gatherNodeId = result.output?.gatherNodeId
				for (const dynamicNode of result.dynamicNodes) {
					traverser.addDynamicNode(dynamicNode.id, dynamicNode, nodeId, gatherNodeId)
				}
			}

			if (!result._fallbackExecuted) {
				const matched = await services.determineNextNodes(
					traverser.getDynamicBlueprint(),
					nodeId,
					result,
					state.getContext(),
					executionId,
				)

				const loopControllerMatch = matched.find(
					(m: { node: NodeDefinition; edge: any }) => m.node.uses === 'loop-controller',
				)
				const finalMatched = loopControllerMatch ? [loopControllerMatch] : matched

				for (const { node, edge } of finalMatched) {
					await services.applyEdgeTransform(edge, result, node, state.getContext(), traverser.getAllPredecessors())
				}

				traverser.markNodeCompleted(
					nodeId,
					result,
					finalMatched.map((m: { node: NodeDefinition; edge: any }) => m.node),
				)
			}
		} else if (executionResult.status === 'failed_with_fallback') {
			const fallbackNodeId = executionResult.fallbackNodeId
			const fallbackNode = blueprint.nodes.find((n: any) => n.id === fallbackNodeId)
			if (fallbackNode) {
				const fallbackExecutor = executorFactory(blueprint)(fallbackNodeId)
				const fallbackExecutionResult = await fallbackExecutor.execute(
					await services.resolveNodeInput(fallbackNodeId, blueprint, state.getContext()),
				)
				if (fallbackExecutionResult.status === 'success') {
					const fallbackResult = fallbackExecutionResult.result
					state.addCompletedNode(fallbackNodeId, fallbackResult.output)
					state.markFallbackExecuted()
					const matched = await services.determineNextNodes(
						traverser.getDynamicBlueprint(),
						nodeId,
						{ ...fallbackResult, _fallbackExecuted: true },
						state.getContext(),
						executionId,
					)

					const loopControllerMatch = matched.find(
						(m: { node: NodeDefinition; edge: any }) => m.node.uses === 'loop-controller',
					)
					const finalMatched = loopControllerMatch ? [loopControllerMatch] : matched

					for (const { node, edge } of finalMatched) {
						await services.applyEdgeTransform(
							edge,
							{ ...fallbackResult, _fallbackExecuted: true },
							node,
							state.getContext(),
							traverser.getAllPredecessors(),
						)
					}

					traverser.markNodeCompleted(
						nodeId,
						{ ...fallbackResult, _fallbackExecuted: true },
						finalMatched.map((m: { node: NodeDefinition; edge: any }) => m.node),
					)
				} else {
					state.addError(nodeId, fallbackExecutionResult.error)
				}
			} else {
				state.addError(nodeId, executionResult.error)
			}
		} else {
			state.addError(nodeId, executionResult.error)
		}
	}
}

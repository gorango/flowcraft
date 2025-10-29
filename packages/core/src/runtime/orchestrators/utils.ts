import { FlowcraftError } from '../../errors'
import type { NodeDefinition, WorkflowBlueprint } from '../../types'
import type { NodeExecutionResult } from '../executors'
import type { WorkflowState } from '../state'
import type { GraphTraverser } from '../traverser'

export async function executeBatch(
	readyNodes: Array<{ nodeId: string; nodeDef: any }>,
	blueprint: WorkflowBlueprint,
	state: WorkflowState<any>,
	executorFactory: (nodeId: string) => any,
	runtime: any,
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
				const executor = executorFactory(nodeId)
				if (!executor) throw new Error(`No executor for node ${nodeId}`)
				const executionResult = await executor.execute(
					await runtime.resolveNodeInput(nodeId, blueprint, state.getContext()),
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
	runtime: any,
	_blueprint: WorkflowBlueprint,
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
			if (result) {
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
			}

			const matched = await runtime.determineNextNodes(
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
				await runtime.applyEdgeTransform(edge, result, node, state.getContext(), traverser.getAllPredecessors())
			}

			traverser.markNodeCompleted(
				nodeId,
				result,
				finalMatched.map((m: { node: NodeDefinition; edge: any }) => m.node),
			)
		} else if (executionResult.status === 'failed_with_fallback') {
			const { fallbackNodeId, error } = executionResult
			const blueprint = traverser.getDynamicBlueprint()
			const fallbackNodeDef = blueprint.nodes.find((n) => n.id === fallbackNodeId)

			if (!fallbackNodeDef) {
				const notFoundError = new FlowcraftError(`Fallback node '${fallbackNodeId}' not found in blueprint.`, {
					nodeId,
					cause: error,
				})
				state.addError(nodeId, notFoundError)
			} else {
				state.addCompletedNode(nodeId, null)
				state.markFallbackExecuted()

				traverser.markNodeCompleted(nodeId, { action: 'fallback', output: null, _fallbackExecuted: true }, [
					fallbackNodeDef,
				])
			}
		} else {
			state.addError(nodeId, executionResult.error)
		}
	}
}

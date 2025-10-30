import { FlowcraftError } from '../../errors'

import type { WorkflowResult } from '../../types'
import type { ExecutionContext } from '../execution-context'
import type { GraphTraverser } from '../traverser'
import type { IOrchestrator } from '../types'
import { executeBatch, processResults } from './utils'

/**
 * An orchestrator that executes only one "tick" or "turn" of the workflow.
 * It processes a single batch of ready nodes from the frontier and then returns,
 * allowing the caller to inspect the intermediate state before proceeding.
 *
 * Useful for debugging, testing, or building interactive tools.
 */
export class StepByStepOrchestrator implements IOrchestrator {
	public async run(context: ExecutionContext<any, any>, traverser: GraphTraverser): Promise<WorkflowResult<any>> {
		try {
			context.signal?.throwIfAborted()
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new FlowcraftError('Workflow cancelled', { isFatal: false })
			}
			throw error
		}

		if (!traverser.hasMoreWork()) {
			const isTraversalComplete = !traverser.hasMoreWork()
			const status = context.state.getStatus(isTraversalComplete)
			const result = await context.state.toResult(context.services.serializer, context.executionId)
			result.status = status
			return result
		}

		const allReadyNodes = traverser.getReadyNodes()
		const nodesToExecute = context.concurrency ? allReadyNodes.slice(0, context.concurrency) : allReadyNodes
		const nodesToSkip = context.concurrency ? allReadyNodes.slice(context.concurrency) : []

		const settledResults = await executeBatch(
			nodesToExecute,
			traverser.getDynamicBlueprint(),
			context.state,
			(nodeId: string) => context.runtime.getExecutorForNode(nodeId, context),
			context.runtime,
			context.concurrency,
		)

		await processResults(
			settledResults,
			traverser,
			context.state,
			context.runtime,
			context.blueprint,
			context.executionId,
		)

		for (const { nodeId } of nodesToSkip) {
			traverser.addToFrontier(nodeId)
		}

		const isTraversalComplete = !traverser.hasMoreWork()
		const status = context.state.getStatus(isTraversalComplete)
		const result = await context.state.toResult(context.services.serializer, context.executionId)
		result.status = status
		return result
	}
}

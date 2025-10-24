import { FlowcraftError } from '../errors'
import type { WorkflowResult } from '../types'
import { ExecutionContext } from './execution-context'
import { executeBatch, processResults } from './orchestrators/utils'
import type { GraphTraverser } from './traverser'
import type { IOrchestrator } from './types'

export class DefaultOrchestrator implements IOrchestrator {
	async run(context: ExecutionContext<any, any>, traverser: GraphTraverser): Promise<WorkflowResult<any>> {
		const hardwareConcurrency = globalThis.navigator?.hardwareConcurrency || 4
		const maxConcurrency = context.concurrency ?? Math.min(hardwareConcurrency, 10)

		try {
			context.signal?.throwIfAborted()
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new FlowcraftError('Workflow cancelled', { isFatal: false })
			}
			throw error
		}

		let iterations = 0
		const maxIterations = 10000

		while (traverser.hasMoreWork()) {
			if (++iterations > maxIterations) {
				throw new Error('Traversal exceeded maximum iterations, possible infinite loop')
			}

			try {
				context.signal?.throwIfAborted()
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') {
					throw new FlowcraftError('Workflow cancelled', { isFatal: false })
				}
				throw error
			}

			const readyNodes = traverser.getReadyNodes()
			const dynamicBlueprint = traverser.getDynamicBlueprint()
			const updatedContext = new ExecutionContext(
				dynamicBlueprint,
				context.state,
				context.nodeRegistry,
				context.executionId,
				context.runtime,
				context.services,
				context.signal,
				context.concurrency,
			)
			const settledResults = await executeBatch(
				readyNodes,
				dynamicBlueprint,
				context.state,
				(nodeId: string) => context.runtime.getExecutorForNode(nodeId, updatedContext),
				context.runtime,
				maxConcurrency,
			)

			await processResults(
				settledResults,
				traverser,
				context.state,
				context.runtime,
				context.blueprint,
				context.executionId,
			)

			if (context.state.isAwaiting()) {
				break
			}
		}

		const isTraversalComplete = !traverser.hasMoreWork()
		const status = context.state.getStatus(isTraversalComplete)
		const result = await context.state.toResult(context.services.serializer)
		result.status = status
		return result
	}
}

export class RunToCompletionOrchestrator extends DefaultOrchestrator {}

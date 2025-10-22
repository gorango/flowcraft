import { FlowcraftError } from '../../errors'
import { JsonSerializer } from '../../serializer'
import type { IEvaluator, WorkflowBlueprint, WorkflowResult } from '../../types'
import type { WorkflowState } from '../state'
import type { GraphTraverser } from '../traverser'
import type { ExecutionServices, IOrchestrator, NodeExecutorFactory } from '../types'
import { executeBatch, processResults } from './utils'

/**
 * An orchestrator that executes only one "tick" or "turn" of the workflow.
 * It processes a single batch of ready nodes from the frontier and then returns,
 * allowing the caller to inspect the intermediate state before proceeding.
 *
 * Useful for debugging, testing, or building interactive tools.
 */
export class StepByStepOrchestrator implements IOrchestrator {
	public async run(
		traverser: GraphTraverser,
		executorFactory: NodeExecutorFactory,
		state: WorkflowState<any>,
		services: ExecutionServices,
		blueprint: WorkflowBlueprint,
		_functionRegistry: Map<string, any> | undefined,
		executionId: string,
		_evaluator: IEvaluator,
		signal?: AbortSignal,
		concurrency?: number,
	): Promise<WorkflowResult<any>> {
		try {
			signal?.throwIfAborted()
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new FlowcraftError('Workflow cancelled', { isFatal: false })
			}
			throw error
		}

		if (!traverser.hasMoreWork()) {
			const status = state.getStatus(traverser.getAllNodeIds(), traverser.getFallbackNodeIds())
			const result = state.toResult(new JsonSerializer())
			result.status = status
			return result
		}

		const allReadyNodes = traverser.getReadyNodes()
		const nodesToExecute = concurrency ? allReadyNodes.slice(0, concurrency) : allReadyNodes
		const nodesToSkip = concurrency ? allReadyNodes.slice(concurrency) : []

		const settledResults = await executeBatch(
			nodesToExecute,
			traverser.getDynamicBlueprint(),
			state,
			executorFactory,
			services,
			concurrency,
		)

		await processResults(settledResults, traverser, state, services, blueprint, executorFactory, executionId)

		for (const { nodeId } of nodesToSkip) {
			traverser.addToFrontier(nodeId)
		}

		const status = state.getStatus(traverser.getAllNodeIds(), traverser.getFallbackNodeIds())
		const result = state.toResult(new JsonSerializer())
		result.status = status
		return result
	}
}

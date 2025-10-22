import { FlowcraftError } from '../errors'
import type { IEvaluator, WorkflowBlueprint, WorkflowResult } from '../types'
import { executeBatch, processResults } from './orchestrators/utils'
import type { WorkflowState } from './state'
import type { GraphTraverser } from './traverser'
import type { ExecutionServices, IOrchestrator, NodeExecutorFactory } from './types'

export class DefaultOrchestrator implements IOrchestrator {
	async run(
		traverser: GraphTraverser,
		executorFactory: NodeExecutorFactory,
		initialState: WorkflowState<any>,
		services: ExecutionServices,
		blueprint: WorkflowBlueprint,
		_functionRegistry: Map<string, any> | undefined,
		_executionId: string,
		_evaluator: IEvaluator,
		_signal?: AbortSignal,
		_concurrency?: number,
	): Promise<WorkflowResult<any>> {
		if (_concurrency === undefined) {
			const hardwareConcurrency = globalThis.navigator?.hardwareConcurrency || 4
			_concurrency = Math.min(hardwareConcurrency, 10)
		}

		try {
			_signal?.throwIfAborted()
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
				_signal?.throwIfAborted()
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') {
					throw new FlowcraftError('Workflow cancelled', { isFatal: false })
				}
				throw error
			}

			const readyNodes = traverser.getReadyNodes()
			const settledResults = await executeBatch(
				readyNodes,
				traverser.getDynamicBlueprint(),
				initialState,
				executorFactory,
				services,
				_concurrency,
			)

			await processResults(settledResults, traverser, initialState, services, blueprint, executorFactory, _executionId)

			if (initialState.isAwaiting()) {
				break
			}
		}

		const status = initialState.getStatus(traverser.getAllNodeIds(), traverser.getFallbackNodeIds())
		const result = initialState.toResult({ serialize: (obj: any) => JSON.stringify(obj) } as any)
		result.status = status
		return result
	}
}

export class RunToCompletionOrchestrator extends DefaultOrchestrator {}

import type { ContextImplementation, EdgeDefinition, NodeDefinition, NodeResult, RuntimeDependencies, RuntimeOptions, WorkflowBlueprint } from '../types'
import type { WorkflowState } from './state'

/** Interface for the core runtime operations used by the traverser. */
export interface IRuntime<TContext extends Record<string, any> = Record<string, any>, TDependencies extends RuntimeDependencies = RuntimeDependencies> {
	options: RuntimeOptions<TDependencies>
	executeNode: (
		blueprint: WorkflowBlueprint,
		nodeId: string,
		state: WorkflowState<TContext>,
		allPredecessors?: Map<string, Set<string>>,
		functionRegistry?: Map<string, any>,
		executionId?: string,
		signal?: AbortSignal,
	) => Promise<NodeResult>
	determineNextNodes: (
		blueprint: WorkflowBlueprint,
		nodeId: string,
		result: NodeResult,
		context: ContextImplementation<TContext>,
	) => Promise<{ node: NodeDefinition, edge: EdgeDefinition }[]>
	applyEdgeTransform: (
		edge: EdgeDefinition,
		sourceResult: NodeResult,
		targetNode: NodeDefinition,
		context: ContextImplementation<TContext>,
		allPredecessors?: Map<string, Set<string>>,
	) => Promise<void>
}

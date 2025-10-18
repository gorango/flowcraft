import type {
	ContextImplementation,
	EdgeDefinition,
	IEvaluator,
	NodeDefinition,
	NodeResult,
	RuntimeDependencies,
	RuntimeOptions,
	WorkflowBlueprint,
	WorkflowResult,
} from '../types'
import type { NodeExecutionResult, NodeExecutor } from './executors'
import type { WorkflowState } from './state'
import type { GraphTraverser } from './traverser'

export type NodeExecutorFactory = (blueprint: WorkflowBlueprint) => (nodeId: string) => NodeExecutor<any, any>

export interface ExecutionServices {
	determineNextNodes: (
		blueprint: WorkflowBlueprint,
		nodeId: string,
		result: NodeResult<any, any>,
		context: ContextImplementation<any>,
		executionId?: string,
	) => Promise<{ node: NodeDefinition; edge: EdgeDefinition }[]>
	applyEdgeTransform: (
		edge: EdgeDefinition,
		sourceResult: NodeResult<any, any>,
		targetNode: NodeDefinition,
		context: ContextImplementation<any>,
		allPredecessors?: Map<string, Set<string>>,
	) => Promise<void>
	resolveNodeInput: (nodeId: string, blueprint: WorkflowBlueprint, context: any) => Promise<any>
}

export interface IOrchestrator {
	run(
		traverser: GraphTraverser,
		executorFactory: NodeExecutorFactory,
		initialState: WorkflowState<any>,
		services: ExecutionServices,
		blueprint: WorkflowBlueprint,
		functionRegistry: Map<string, any> | undefined,
		executionId: string,
		evaluator: IEvaluator,
		signal?: AbortSignal,
		concurrency?: number,
	): Promise<WorkflowResult<any>>
}

export type { NodeExecutor, NodeExecutionResult }

export interface IRuntime<
	TContext extends Record<string, any> = Record<string, any>,
	TDependencies extends RuntimeDependencies = RuntimeDependencies,
> {
	options: RuntimeOptions<TDependencies>
	registry: Record<string, any>
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
		executionId?: string,
	) => Promise<{ node: NodeDefinition; edge: EdgeDefinition }[]>
	applyEdgeTransform: (
		edge: EdgeDefinition,
		sourceResult: NodeResult,
		targetNode: NodeDefinition,
		context: ContextImplementation<TContext>,
		allPredecessors?: Map<string, Set<string>>,
	) => Promise<void>
}

import type {
	ContextImplementation,
	EdgeDefinition,
	NodeClass,
	NodeDefinition,
	NodeFunction,
	NodeResult,
	RuntimeDependencies,
	RuntimeOptions,
	WorkflowBlueprint,
	WorkflowResult,
} from '../types'
import type { ExecutionContext } from './execution-context'
import type { NodeExecutionResult, NodeExecutor } from './executors'
import type { WorkflowState } from './state'
import type { GraphTraverser } from './traverser'

export type NodeExecutorFactory = (context: ExecutionContext<any, any>) => (nodeId: string) => NodeExecutor<any, any>

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
	run(context: ExecutionContext<any, any>, traverser: GraphTraverser): Promise<WorkflowResult<any>>
}

export type { NodeExecutor, NodeExecutionResult }

export interface IRuntime<
	TContext extends Record<string, any> = Record<string, any>,
	TDependencies extends RuntimeDependencies = RuntimeDependencies,
> {
	options: RuntimeOptions<TDependencies>
	registry: Map<string, NodeFunction | NodeClass>
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
	createForSubflow: (
		subBlueprint: WorkflowBlueprint,
		initialSubState: Partial<TContext>,
		executionId: string,
		signal?: AbortSignal,
	) => ExecutionContext<TContext, TDependencies>
	getExecutorForNode: (
		nodeId: string,
		context: ExecutionContext<TContext, TDependencies>,
	) => NodeExecutor<TContext, TDependencies>
}

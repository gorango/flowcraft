import type {
	IEvaluator,
	IEventBus,
	ILogger,
	ISerializer,
	Middleware,
	NodeClass,
	NodeFunction,
	RuntimeDependencies,
	WorkflowBlueprint,
} from '../types'
import type { FlowRuntime } from './runtime'
import { WorkflowState } from './state'

/**
 * A container for all state and dependencies of a single workflow execution.
 * This object is created once per `run` and passed through the execution stack.
 */
export class ExecutionContext<TContext extends Record<string, any>, TDependencies extends RuntimeDependencies> {
	constructor(
		public readonly blueprint: WorkflowBlueprint,
		public readonly state: WorkflowState<TContext>,
		public readonly nodeRegistry: Map<string, NodeFunction | NodeClass>,
		public readonly executionId: string,
		public readonly runtime: FlowRuntime<TContext, TDependencies>, // A reference back to the runtime for orchestrating subflows
		public readonly services: {
			logger: ILogger
			eventBus: IEventBus
			serializer: ISerializer
			evaluator: IEvaluator
			middleware: Middleware[]
			dependencies: TDependencies
		},
		public readonly signal?: AbortSignal,
		public readonly concurrency?: number,
	) {
		// Configure the state's context to emit events
		this.state.setEventEmitter(this.services.eventBus, this.executionId)
	}

	public createForSubflow(
		subBlueprint: WorkflowBlueprint,
		initialSubState: Partial<TContext>,
	): ExecutionContext<TContext, TDependencies> {
		const subState = new WorkflowState<TContext>(initialSubState)
		return new ExecutionContext(
			subBlueprint,
			subState,
			this.nodeRegistry,
			this.executionId,
			this.runtime,
			this.services,
			this.signal,
			this.concurrency,
		)
	}
}

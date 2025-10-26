import type { FlowRuntime } from '../runtime'
import { ExecutionContext } from '../runtime/execution-context'
import { StepByStepOrchestrator } from '../runtime/orchestrators/step-by-step'
import { WorkflowState } from '../runtime/state'
import { GraphTraverser } from '../runtime/traverser'
import type { NodeClass, NodeFunction, WorkflowBlueprint, WorkflowResult } from '../types'

/**
 * Represents the controlled, step-by-step execution of a workflow.
 * Returned by the `createStepper` utility.
 */
export interface IWorkflowStepper<TContext extends Record<string, any>> {
	/** The current state of the workflow. Can be inspected after each step. */
	readonly state: WorkflowState<TContext>

	/** The graph traverser instance. Can be used to inspect the frontier or completed nodes. */
	readonly traverser: GraphTraverser

	/**
	 * Executes the next "turn" or batch of ready nodes in the workflow.
	 * @param options Optional configuration for this specific step, like a cancellation signal.
	 * @returns A `WorkflowResult` representing the state after the step, or `null` if the workflow has already completed.
	 */
	next(options?: { signal?: AbortSignal; concurrency?: number }): Promise<WorkflowResult<TContext> | null>

	/**
	 * Reverts the workflow to its previous state.
	 * @returns The `WorkflowResult` of the previous state, or `null` if there is no history to revert to.
	 */
	prev(): Promise<WorkflowResult<TContext> | null>

	/**
	 * Resets the stepper to its initial state, clearing all progress and history.
	 */
	reset(): void

	/**
	 * A convenience method to check if the workflow has any more steps to run.
	 * @returns `true` if the workflow is complete or stalled, `false` otherwise.
	 */
	isDone(): boolean
}

/**
 * A test utility that creates a stepper to execute a workflow one "turn" at a time.
 * This is invaluable for debugging and writing fine-grained tests where you need to
 * assert the state of the workflow after each logical step.
 *
 * @example
 * // In your test file
 * it('should correctly execute step-by-step', async () => {
 *   const runtime = new FlowRuntime({ ... });
 *   const flow = createFlow('test')
 *     .node('a', async () => ({ output: 10 }))
 *     .node('b', async ({ input }) => ({ output: input * 2 }))
 *     .edge('a', 'b');
 *
 *   const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry());
 *
 *   // First step (executes node 'a')
 *   const result1 = await stepper.next();
 *   expect(stepper.isDone()).toBe(false);
 *   expect(result1.status).toBe('stalled');
 *   expect(result1.context._outputs.a).toBe(10);
 *
 *   // Second step (executes node 'b')
 *   const result2 = await stepper.next();
 *   expect(stepper.isDone()).toBe(true);
 *   expect(result2.status).toBe('completed');
 *   expect(result2.context._outputs.b).toBe(20);
 *
 *   // Final step (no more work)
 *   const result3 = await stepper.next();
 *   expect(result3).toBeNull();
 * });
 *
 * @param runtime The `FlowRuntime` instance, used for its configuration.
 * @param blueprint The `WorkflowBlueprint` to execute.
 * @param functionRegistry The function registry from createFlow, containing the node implementations.
 * @param initialState The initial state for the workflow run.
 * @returns A Promise that resolves to an `IWorkflowStepper` instance.
 */
export async function createStepper<TContext extends Record<string, any>, TDependencies extends Record<string, any>>(
	runtime: FlowRuntime<TContext, TDependencies>,
	blueprint: WorkflowBlueprint,
	functionRegistry: Map<string, NodeFunction | NodeClass>,
	initialState: Partial<TContext> = {},
): Promise<IWorkflowStepper<TContext>> {
	const _initialBlueprint = structuredClone(blueprint)
	const _initialState = structuredClone(initialState)

	let state: WorkflowState<TContext>
	let traverser: GraphTraverser
	const history: string[] = []

	const orchestrator = new StepByStepOrchestrator()
	const executionId = globalThis.crypto?.randomUUID()
	const nodeRegistry = new Map([...runtime.registry, ...functionRegistry])

	const initialize = () => {
		state = new WorkflowState<TContext>(_initialState)
		traverser = new GraphTraverser(_initialBlueprint)
		history.length = 0
	}

	initialize()

	const stepper: IWorkflowStepper<TContext> = {
		get state() {
			return state
		},
		get traverser() {
			return traverser
		},
		isDone() {
			return !traverser.hasMoreWork() && !state.isAwaiting()
		},
		reset() {
			initialize()
		},
		async prev() {
			const previousStateJson = history.pop()
			if (!previousStateJson) {
				return null
			}

			const previousStateData = runtime.serializer.deserialize(previousStateJson) as Partial<TContext>

			state = new WorkflowState(previousStateData)
			traverser = GraphTraverser.fromState(_initialBlueprint, state)

			return state.toResult(runtime.serializer)
		},
		async next(options: { signal?: AbortSignal; concurrency?: number } = {}) {
			if (stepper.isDone()) {
				return null
			}

			const serializedContext = (await state.toResult(runtime.serializer)).serializedContext
			history.push(serializedContext)

			const executionContext = new ExecutionContext(
				_initialBlueprint,
				state,
				nodeRegistry,
				executionId,
				runtime,
				{
					logger: runtime.logger,
					eventBus: runtime.eventBus,
					serializer: runtime.serializer,
					evaluator: runtime.evaluator,
					middleware: runtime.middleware,
					dependencies: runtime.dependencies,
				},
				options.signal,
				options.concurrency,
			)
			return orchestrator.run(executionContext, traverser)
		},
	}

	return stepper
}

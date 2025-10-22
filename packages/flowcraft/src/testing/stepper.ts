import { FlowcraftError } from '../errors'
import { PropertyEvaluator } from '../evaluator'
import { NullLogger } from '../logger'
import { NodeExecutor } from '../runtime/executors'
import { StepByStepOrchestrator } from '../runtime/orchestrators/step-by-step'
import type { FlowRuntime } from '../runtime/runtime'
import { WorkflowState } from '../runtime/state'
import { GraphTraverser } from '../runtime/traverser'
import type { ExecutionServices, NodeExecutorFactory } from '../runtime/types'
import { JsonSerializer } from '../serializer'
import type { WorkflowBlueprint, WorkflowResult } from '../types'

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
 * @param initialState The initial state for the workflow run, can be a serialized string.
 * @returns A Promise that resolves to an `IWorkflowStepper` instance.
 */
export async function createStepper<TContext extends Record<string, any>, TDependencies extends Record<string, any>>(
	runtime: FlowRuntime<TContext, TDependencies>,
	blueprint: WorkflowBlueprint,
	functionRegistry: Map<string, any>,
	initialState: Partial<TContext> | string = {},
): Promise<IWorkflowStepper<TContext>> {
	const {
		logger = new NullLogger(),
		eventBus = { emit: async () => {} },
		middleware = [],
		evaluator = new PropertyEvaluator(),
		serializer = new JsonSerializer(),
		dependencies = {},
	} = runtime.options

	const contextData =
		typeof initialState === 'string' ? (serializer.deserialize(initialState) as Partial<TContext>) : initialState

	const state = new WorkflowState<TContext>(contextData)
	const traverser = new GraphTraverser(blueprint)
	const orchestrator = new StepByStepOrchestrator()
	const executionId = globalThis.crypto?.randomUUID()

	// Replicate the dependency setup from the main runtime `run` method
	const nodeExecutorFactory: NodeExecutorFactory = (dynamicBlueprint: WorkflowBlueprint) => (nodeId: string) => {
		const nodeDef = dynamicBlueprint.nodes.find((n) => n.id === nodeId)
		if (!nodeDef) {
			throw new FlowcraftError(`Node '${nodeId}' not found in blueprint.`, {
				nodeId,
				blueprintId: dynamicBlueprint.id,
				executionId,
				isFatal: true,
			})
		}
		return new NodeExecutor<TContext, TDependencies>({
			blueprint: dynamicBlueprint,
			nodeDef,
			state,
			dependencies: dependencies as TDependencies,
			logger,
			eventBus,
			middleware,
			strategy: runtime.getExecutor(nodeDef, functionRegistry),
			executionId,
		})
	}

	const executionServices: ExecutionServices = {
		determineNextNodes: runtime.determineNextNodes.bind(runtime),
		applyEdgeTransform: runtime.applyEdgeTransform.bind(runtime),
		resolveNodeInput: (nodeId: string, blueprint: WorkflowBlueprint, context: any) => {
			const nodeDef = blueprint.nodes.find((n) => n.id === nodeId)
			if (!nodeDef) return Promise.resolve(undefined)
			return runtime.resolveNodeInput(nodeDef, context)
		},
	}

	return {
		state,
		traverser,
		isDone() {
			return !traverser.hasMoreWork()
		},
		async next(options: { signal?: AbortSignal; concurrency?: number } = {}) {
			if (!traverser.hasMoreWork()) {
				return null
			}
			return orchestrator.run(
				traverser,
				nodeExecutorFactory,
				state,
				executionServices,
				blueprint,
				undefined, // functionRegistry from createFlow is handled by getExecutor
				executionId,
				evaluator,
				options.signal,
				options.concurrency,
			)
		},
	}
}

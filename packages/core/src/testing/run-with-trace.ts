import { FlowRuntime } from '../runtime'
import type { WorkflowBlueprint } from '../types'
import { InMemoryEventLogger } from './event-logger'

/**
 * A test helper that executes a workflow and automatically prints a detailed
 * execution trace to the console if the workflow fails.
 *
 * @example
 * // In your test file (e.g., my-workflow.test.ts)
 * it('should process data correctly', async () => {
 *   const flow = createFlow('my-flow')
 *     .node('a', async () => ({ output: 1 }))
 *     .node('b', async ({ input }) => ({ output: input + 1 })) // Bug: returns { output: 3 }
 *     .edge('a', 'b')
 *
 *   const runtime = new FlowRuntime({})
 *
 *   // If this test fails, a full, human-readable trace of the execution
 *   // (inputs, outputs, context changes) is printed to the console.
 *   const result = await runWithTrace(runtime, flow.toBlueprint())
 *
 *   expect(result.context.b).toBe(2)
 * })
 *
 * @param runtime The original FlowRuntime instance (its options will be used).
 * @param blueprint The WorkflowBlueprint to execute.
 * @param initialState The initial state for the workflow run.
 * @param options Additional options for the run.
 * @returns The WorkflowResult if successful.
 */
export async function runWithTrace<TContext extends Record<string, any>>(
	runtime: FlowRuntime<TContext, any>,
	blueprint: WorkflowBlueprint,
	initialState: Partial<TContext> | string = {},
	options: {
		functionRegistry?: Map<string, any>
		strict?: boolean
		signal?: AbortSignal
	} = {},
) {
	const eventLogger = new InMemoryEventLogger()
	const testRuntime = new FlowRuntime({
		...runtime.options,
		eventBus: eventLogger,
	})

	try {
		const result = await testRuntime.run(blueprint, initialState, options)
		if (process.env.DEBUG) {
			eventLogger.printLog(`Successful Trace: ${blueprint.id}`)
		}
		return result
	} catch (error) {
		eventLogger.printLog(`Failing Test Trace: ${blueprint.id}`)
		throw error
	}
}

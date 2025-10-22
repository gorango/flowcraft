import { describe, expect, it } from 'vitest'
import { createFlow } from '../../src/flow'
import { FlowRuntime } from '../../src/runtime/runtime'
import { InMemoryEventLogger, runWithTrace } from '../../src/testing'

describe('Human-in-the-Loop (HITL)', () => {
	it('should pause workflow at wait node', async () => {
		const flow = createFlow<{ input: number }>('approval-workflow')
			.node('start', async ({ input }) => {
				return { output: { value: input } }
			})
			.edge('start', 'wait-for-approval')
			.wait('wait-for-approval')

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime({
			registry: Object.fromEntries(flow.getFunctionRegistry()),
		})

		const initialResult = await runWithTrace(runtime, blueprint, { input: 42 })

		expect(initialResult.status).toBe('awaiting')
		expect(initialResult.context.input).toBe(42)
		expect(initialResult.context._awaitingNodeId).toBe('wait-for-approval')
	})

	it('should persist awaiting state in serialized context', async () => {
		const flow = createFlow<{ input: number }>('approval-workflow')
			.node('start', async ({ input }) => {
				return { output: { value: input } }
			})
			.edge('start', 'wait-for-approval')
			.wait('wait-for-approval')

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime({
			registry: Object.fromEntries(flow.getFunctionRegistry()),
		})

		const initialResult = await runtime.run(blueprint, { input: 42 })

		const deserializedContext = JSON.parse(initialResult.serializedContext)
		expect(deserializedContext._awaitingNodeId).toBe('wait-for-approval')
		expect(deserializedContext['_outputs.start']).toBeDefined()
	})

	it('should handle multiple sequential wait nodes', async () => {
		const eventLogger = new InMemoryEventLogger()
		const flow = createFlow<{ input: number }>('multi-wait-workflow')
			.node(
				'start',
				async ({ input }) => {
					return { output: { value: input } }
				},
				{ inputs: 'input' },
			)
			.edge('start', 'wait1')
			.wait('wait1')
			.edge('wait1', 'wait2')
			.wait('wait2')
			.edge('wait2', 'end')
			.node(
				'end',
				async ({ input }) => {
					return { output: { final: input.value + 10 } }
				},
				{ inputs: '_outputs.start' },
			)

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime({
			registry: Object.fromEntries(flow.getFunctionRegistry()),
			eventBus: eventLogger,
		})

		// First run: should pause at wait1
		const result1 = await runtime.run(blueprint, { input: 42 })
		eventLogger.printLog('Workflow Execution Trace')
		expect(result1.status).toBe('awaiting')
		expect(result1.context._awaitingNodeId).toBe('wait1')

		// Resume: should pause at wait2
		const result2 = await runtime.resume(blueprint, result1.serializedContext, { output: { value: 42 } })
		eventLogger.printLog('Workflow Execution Trace')
		expect(result2.status).toBe('awaiting')
		expect(result2.context._awaitingNodeId).toBe('wait2')

		// Resume again: should complete
		const result3 = await runtime.resume(blueprint, result2.serializedContext, { output: { value: 42 } })
		eventLogger.printLog('Workflow Execution Trace')
		expect(result3.status).toBe('completed')
		expect(result3.context['_outputs.end'].final).toBe(52)
	})

	it.skip('should handle nested subflow with wait node', async () => {
		const eventLogger = new InMemoryEventLogger()
		const subflow = createFlow<{ input: number }>('sub-approval-workflow')
			.node(
				'sub-start',
				async ({ input }) => {
					return { output: { value: input } }
				},
				{ inputs: 'input' },
			)
			.edge('sub-start', 'sub-wait')
			.wait('sub-wait')
			.edge('sub-wait', 'sub-end')
			.node(
				'sub-end',
				async ({ input }) => {
					return { output: { subFinal: input.value + 5 } }
				},
				{ inputs: '_outputs.sub-start' },
			)

		const mainFlow = createFlow<{ input: number }>('main-workflow')
			.node(
				'main-start',
				async ({ input }) => {
					return { output: { value: input } }
				},
				{ inputs: 'input' },
			)
			.edge('main-start', 'subflow')
			.node('subflow', {
				uses: 'subflow',
				params: {
					blueprintId: subflow.toBlueprint().id,
					inputs: { input: 'main-start' },
				},
			})
			.edge('subflow', 'main-end')
			.node('main-end', async ({ input }) => {
				return { output: { final: input.subFinal + 10 } }
			})

		const blueprint = mainFlow.toBlueprint()
		const runtime = new FlowRuntime({
			eventBus: eventLogger,
			registry: {
				...Object.fromEntries(mainFlow.getFunctionRegistry()),
				...Object.fromEntries(subflow.getFunctionRegistry()),
			},
			blueprints: { [subflow.toBlueprint().id]: subflow.toBlueprint() },
		})

		// First run: should pause at sub-wait
		const result1 = await runtime.run(blueprint, { input: 42 })
		eventLogger.printLog('Subflow Execution Trace')
		expect(result1.status).toBe('awaiting')
		expect(result1.context._awaitingNodeId).toBe('subflow')

		// Resume: should complete the subflow and continue to main-end
		const result2 = await runtime.resume(blueprint, result1.serializedContext, { output: { value: 42 } })
		eventLogger.printLog('Main Flow Execution Trace')
		expect(result2.status).toBe('completed')
		expect(result2.context['_outputs.main-end'].final).toBe(57) // 42 + 5 + 10
	})
})

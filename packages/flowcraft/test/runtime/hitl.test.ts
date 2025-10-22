import { describe, expect, it } from 'vitest'
import { createFlow } from '../../src/flow'
import { SubflowNode } from '../../src/nodes/subflow.node'
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
		expect(initialResult.context._awaitingNodeIds).toEqual(['wait-for-approval'])
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
		expect(deserializedContext._awaitingNodeIds).toEqual(['wait-for-approval'])
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
		expect(result1.context._awaitingNodeIds).toEqual(['wait1'])

		// Resume: should pause at wait2
		const result2 = await runtime.resume(blueprint, result1.serializedContext, { output: { value: 42 } }, 'wait1')
		eventLogger.printLog('Workflow Execution Trace')
		expect(result2.status).toBe('awaiting')
		expect(result2.context._awaitingNodeIds).toEqual(['wait2'])

		// Resume again: should complete
		const result3 = await runtime.resume(blueprint, result2.serializedContext, { output: { value: 42 } }, 'wait2')
		eventLogger.printLog('Workflow Execution Trace')
		expect(result3.status).toBe('completed')
		expect(result3.context['_outputs.end'].final).toBe(52)
	})

	it('should handle nested subflow with wait node', async () => {
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
					return { output: { subFinal: input.value.value + 5 } }
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
			.node('subflow', SubflowNode, {
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
		expect(result1.context._awaitingNodeIds).toEqual(['subflow'])

		// Resume: should complete the subflow and continue to main-end
		const result2 = await runtime.resume(blueprint, result1.serializedContext, { output: { value: 42 } }, 'subflow')
		eventLogger.printLog('Main Flow Execution Trace')
		expect(result2.status).toBe('completed')
		expect(result2.context['_outputs.main-end'].final).toBe(57) // 42 + 5 + 10
	})

	it('should handle multiple concurrent wait nodes', async () => {
		const eventLogger = new InMemoryEventLogger()
		const flow = createFlow<{ input: number }>('concurrent-wait-workflow')
			.node(
				'start',
				async ({ input }) => {
					return { output: { value: input } }
				},
				{ inputs: 'input' },
			)
			.edge('start', 'wait1')
			.wait('wait1')
			.edge('wait1', 'process1')
			.node(
				'process1',
				async ({ input }) => {
					return { output: { result1: `Branch 1: ${input.value}` } }
				},
				{ inputs: '_outputs.start' },
			)
			.edge('start', 'wait2')
			.wait('wait2')
			.edge('wait2', 'process2')
			.node(
				'process2',
				async ({ input }) => {
					return { output: { result2: `Branch 2: ${input.value}` } }
				},
				{ inputs: '_outputs.start' },
			)
			.edge('process1', 'gather')
			.edge('process2', 'gather')
			.node(
				'gather',
				async ({ input }) => {
					return { output: { combined: `Results: ${input.result1.result1}, ${input.result2.result2}` } }
				},
				{ inputs: { result1: '_outputs.process1', result2: '_outputs.process2' } },
			)

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime({
			registry: Object.fromEntries(flow.getFunctionRegistry()),
			eventBus: eventLogger,
		})

		// First run: should pause at both wait1 and wait2
		const result1 = await runtime.run(blueprint, { input: 42 })
		eventLogger.printLog('Initial Workflow Execution Trace')
		expect(result1.status).toBe('awaiting')
		expect(result1.context._awaitingNodeIds).toEqual(['wait1', 'wait2'])

		// Resume wait1: should still be awaiting wait2
		const result2 = await runtime.resume(blueprint, result1.serializedContext, { output: { value: 42 } }, 'wait1')
		eventLogger.printLog('After Resuming wait1')
		expect(result2.status).toBe('awaiting')
		expect(result2.context._awaitingNodeIds).toEqual(['wait2'])

		// Resume wait2: should complete the workflow
		const result3 = await runtime.resume(blueprint, result2.serializedContext, { output: { value: 42 } }, 'wait2')
		eventLogger.printLog('After Resuming wait2')
		expect(result3.status).toBe('completed')
		expect(result3.context['_outputs.gather'].combined).toBe('Results: Branch 1: 42, Branch 2: 42')
	})
})

import { describe, expect, it } from 'vitest'
import { createFlow } from '../../src/flow'
import { FlowRuntime } from '../../src/runtime/runtime'
import { runWithTrace } from '../../src/testing'

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
})

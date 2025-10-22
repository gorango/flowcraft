import { describe, expect, it } from 'vitest'
import { createFlow } from '../../src/flow'
import { FlowRuntime } from '../../src/runtime'
import { createStepper } from '../../src/testing'

describe('createStepper', () => {
	it('should create a stepper for a simple linear workflow', async () => {
		const flow = createFlow('linear')
			.node('A', async () => ({ output: 'resultA' }))
			.node('B', async (ctx) => ({ output: `${ctx.input}_B` }))
			.edge('A', 'B')

		const runtime = new FlowRuntime({})
		const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry(), {})

		expect(stepper.state).toBeDefined()
		expect(stepper.traverser).toBeDefined()
		expect(stepper.isDone()).toBe(false)
	})

	it('should execute steps one by one', async () => {
		const flow = createFlow('linear')
			.node('A', async () => ({ output: 'resultA' }))
			.node('B', async (ctx) => ({ output: `${ctx.input}_B` }))
			.edge('A', 'B')

		const runtime = new FlowRuntime({})
		const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry(), {})

		// First step: execute node A
		const result1 = await stepper.next()
		expect(result1).toBeDefined()
		expect(result1?.status).toBe('stalled')
		expect(stepper.state.getContext().get('_outputs.A')).toBe('resultA')
		expect(stepper.isDone()).toBe(false)

		// Second step: execute node B
		const result2 = await stepper.next()
		expect(result2).toBeDefined()
		expect(result2?.status).toBe('completed')
		expect(stepper.state.getContext().get('_outputs.B')).toBe('resultA_B')
		expect(stepper.isDone()).toBe(true)

		// No more steps
		const result3 = await stepper.next()
		expect(result3).toBeNull()
	})

	it('should handle a workflow with no edges', async () => {
		const flow = createFlow('no-edges')
			.node('A', async () => ({ output: 'resultA' }))
			.node('B', async () => ({ output: 'resultB' }))

		const runtime = new FlowRuntime({})
		const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry(), {})

		// First step: execute both A and B in parallel
		const result1 = await stepper.next()
		expect(result1).toBeDefined()
		expect(result1?.status).toBe('completed')
		expect(stepper.state.getContext().get('_outputs.A')).toBe('resultA')
		expect(stepper.state.getContext().get('_outputs.B')).toBe('resultB')
		expect(stepper.isDone()).toBe(true)

		// No more steps
		const result2 = await stepper.next()
		expect(result2).toBeNull()
	})

	it('should respect concurrency options', async () => {
		const flow = createFlow('parallel')
			.node('A', async () => ({ output: 'A' }))
			.node('B', async () => ({ output: 'B' }))
			.node('C', async () => ({ output: 'C' }))
			.node('D', async (ctx) => ({ output: `D: ${ctx.input}` }), { inputs: 'C' })
			.edge('A', 'D')
			.edge('B', 'D')
			.edge('C', 'D')

		const runtime = new FlowRuntime({})
		const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry(), {})

		// First step with concurrency 1
		const result1 = await stepper.next({ concurrency: 1 })
		expect(result1).toBeDefined()
		expect(result1?.status).toBe('stalled')
		expect(stepper.state.getContext().get('_outputs.A')).toBe('A')
		expect(stepper.state.getContext().get('_outputs.B')).toBeUndefined()
		expect(stepper.state.getContext().get('_outputs.C')).toBeUndefined()
		expect(stepper.isDone()).toBe(false)

		// Second step
		const result2 = await stepper.next({ concurrency: 1 })
		expect(result2).toBeDefined()
		expect(result2?.status).toBe('stalled')
		expect(stepper.state.getContext().get('_outputs.B')).toBe('B')
		expect(stepper.state.getContext().get('_outputs.C')).toBeUndefined()
		expect(stepper.isDone()).toBe(false)

		// Third step
		const result3 = await stepper.next({ concurrency: 1 })
		expect(result3).toBeDefined()
		expect(result3?.status).toBe('stalled')
		expect(stepper.state.getContext().get('_outputs.C')).toBe('C')
		expect(stepper.state.getContext().get('_outputs.D')).toBeUndefined()
		expect(stepper.isDone()).toBe(false)

		// Fourth step
		const result4 = await stepper.next({ concurrency: 1 })
		expect(result4).toBeDefined()
		expect(result4?.status).toBe('completed')
		expect(stepper.state.getContext().get('_outputs.D')).toBe('D: C')
		expect(stepper.isDone()).toBe(true)
	})

	it('should handle initial state', async () => {
		const flow = createFlow('with-initial').node('A', async (ctx) => ({
			output: (await ctx.context.get('value')) || 'default',
		}))

		const runtime = new FlowRuntime({})
		const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry(), { value: 'initial' })

		const result = await stepper.next()
		expect(result).toBeDefined()
		expect(result?.status).toBe('completed')
		expect(stepper.state.getContext().get('_outputs.A')).toBe('initial')
	})
})

import { describe, expect, it, vi } from 'vitest'
import { createFlow } from '../../src/flow'
import { SleepNode } from '../../src/nodes/sleep'
import { WebhookNode } from '../../src/nodes/webhook'
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
		const context1 = await stepper.state.getContext().toJSON()
		expect(context1['_outputs.A']).toBe('resultA')
		expect(stepper.isDone()).toBe(false)

		// Second step: execute node B
		const result2 = await stepper.next()
		expect(result2).toBeDefined()
		expect(result2?.status).toBe('completed')
		const context2 = await stepper.state.getContext().toJSON()
		expect(context2['_outputs.B']).toBe('resultA_B')
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
		const context = await stepper.state.getContext().toJSON()
		expect(context['_outputs.A']).toBe('resultA')
		expect(context['_outputs.B']).toBe('resultB')
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
		const getOutputs = () => stepper.state.getContext().toJSON()

		// First step with concurrency 1
		const result1 = await stepper.next({ concurrency: 1 })
		expect(result1?.status).toBe('stalled')
		expect((await getOutputs())['_outputs.A']).toBe('A')
		expect((await getOutputs())['_outputs.B']).toBeUndefined()
		expect((await getOutputs())['_outputs.C']).toBeUndefined()
		expect(stepper.isDone()).toBe(false)

		// Second step
		const result2 = await stepper.next({ concurrency: 1 })
		expect(result2?.status).toBe('stalled')
		expect((await getOutputs())['_outputs.B']).toBe('B')
		expect((await getOutputs())['_outputs.C']).toBeUndefined()
		expect(stepper.isDone()).toBe(false)

		// Third step
		const result3 = await stepper.next({ concurrency: 1 })
		expect(result3?.status).toBe('stalled')
		expect((await getOutputs())['_outputs.C']).toBe('C')
		expect((await getOutputs())['_outputs.D']).toBeUndefined()
		expect(stepper.isDone()).toBe(false)

		// Fourth step
		const result4 = await stepper.next({ concurrency: 1 })
		expect(result4?.status).toBe('completed')
		expect((await getOutputs())['_outputs.D']).toBe('D: C')
		expect(stepper.isDone()).toBe(true)
	})

	it('should handle initial state', async () => {
		const flow = createFlow('with-initial').node('A', async (ctx) => ({
			output: (await ctx.context.get('value')) || 'default',
		}))

		const runtime = new FlowRuntime({})
		const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry(), { value: 'initial' })

		const result = await stepper.next()
		expect(result?.status).toBe('completed')
		const context = await stepper.state.getContext().toJSON()
		expect(context['_outputs.A']).toBe('initial')
	})

	it('should reset the workflow to its initial state', async () => {
		const flow = createFlow('reset-test')
			.node('A', async () => ({ output: 1 }))
			.node('B', async (ctx) => ({ output: (ctx.input as number) + 1 }))
			.edge('A', 'B')

		const runtime = new FlowRuntime({})
		const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry())

		await stepper.next()
		expect((await stepper.state.getContext().toJSON())['_outputs.A']).toBe(1)
		expect(stepper.isDone()).toBe(false)

		stepper.reset()

		expect((await stepper.state.getContext().toJSON())['_outputs.A']).toBeUndefined()
		expect(stepper.isDone()).toBe(false)
		expect(stepper.traverser.getCompletedNodes().size).toBe(0)

		// Can execute from the beginning again
		const result = await stepper.next()
		expect(result?.status).toBe('stalled')
		expect((await stepper.state.getContext().toJSON())['_outputs.A']).toBe(1)
	})

	it('should go back to the previous state using prev()', async () => {
		const flow = createFlow('prev-test')
			.node('A', async () => ({ output: 'A' }))
			.node('B', async () => ({ output: 'B' }))
			.edge('A', 'B')

		const runtime = new FlowRuntime({})
		const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry())

		// Initial state
		expect(stepper.state.getCompletedNodes().size).toBe(0)

		// Step 1: Execute A
		await stepper.next()
		expect((await stepper.state.getContext().toJSON())['_outputs.A']).toBe('A')
		expect(stepper.state.getCompletedNodes().has('B')).toBe(false)
		expect(stepper.isDone()).toBe(false)

		// Step 2: Execute B
		await stepper.next()
		expect((await stepper.state.getContext().toJSON())['_outputs.B']).toBe('B')
		expect(stepper.isDone()).toBe(true)

		// Go back to after A was executed
		await stepper.prev()
		const context1 = await stepper.state.getContext().toJSON()
		expect(context1['_outputs.A']).toBe('A')
		expect(context1['_outputs.B']).toBeUndefined()
		expect(stepper.state.getCompletedNodes().has('A')).toBe(true)
		expect(stepper.state.getCompletedNodes().has('B')).toBe(false)
		expect(stepper.isDone()).toBe(false)

		// Go back to the initial state
		await stepper.prev()
		const context2 = await stepper.state.getContext().toJSON()
		expect(stepper.state.getCompletedNodes().size).toBe(0)
		expect(context2['_outputs.A']).toBeUndefined()
		expect(stepper.isDone()).toBe(false)

		// Nothing more to go back to
		const nullState = await stepper.prev()
		expect(nullState).toBeNull()
	})

	it('should handle node failure', async () => {
		const flow = createFlow('failure-test')
			.node('A', async () => ({ output: 'A' }))
			.node('B', async () => {
				throw new Error('Node B failed')
			})
			.node('C', async () => ({ output: 'C' }))
			.edge('A', 'B')
			.edge('B', 'C')

		const runtime = new FlowRuntime({})
		const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry(), {})

		// Step 1: Execute A
		await stepper.next()
		expect((await stepper.state.getContext().toJSON())['_outputs.A']).toBe('A')

		// Step 2: Execute B, which fails
		const result2 = await stepper.next()
		expect(result2?.status).toBe('failed')
		expect(
			result2?.errors?.some((e) => e.message?.includes('Node B failed') || e.message?.includes('execution failed')),
		).toBe(true)
	})

	it('should handle loop controller', async () => {
		const flow = createFlow('loop-controller-test')
			.node('init', async ({ context }) => {
				await context.set('count', 0)
				return { output: 'init' }
			})
			.node('work', async ({ context }) => {
				const count = (await context.get('count')) || 0
				await context.set('count', count + 1)
				return { output: `work_${count}` }
			})
			.node('end', async () => ({ output: 'end' }))
			.edge('init', 'work')
			.loop('test-loop', {
				startNodeId: 'work',
				endNodeId: 'work',
				condition: 'count < 1',
			})
			.edge('work', 'end')

		const runtime = new FlowRuntime({ evaluator: new (await import('../../src/evaluator')).UnsafeEvaluator() })
		const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry(), {})

		// Execute steps
		await stepper.next() // init
		await stepper.next() // work1
		await stepper.next() // end
		const result = await stepper.next()
		expect(result?.status).toBe('completed')
		expect((await stepper.state.getContext().toJSON())['_outputs.end']).toBe('end')
	})

	it('should handle durable primitives', async () => {
		// Test sleep node
		const runtime = new FlowRuntime({})
		const flow = createFlow('durable-test').node('sleep', SleepNode, { params: { duration: '5m' } })

		const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry(), {})
		const sleepResult = await stepper.next()
		expect(sleepResult?.status).toBe('awaiting')
		expect(stepper.isDone()).toBe(false)
	})

	it('should handle waitForEvent node', async () => {
		const runtime = new FlowRuntime({})
		const flow = createFlow('wait-test').wait('wait', { params: { eventName: 'test_event' } })

		const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry(), {})
		const waitResult = await stepper.next()
		expect(waitResult?.status).toBe('awaiting')
		expect(stepper.isDone()).toBe(false)
	})

	it('should handle webhook node', async () => {
		const mockAdapter = {
			registerWebhookEndpoint: vi.fn().mockResolvedValue({
				url: 'https://example.com/webhook/123',
				event: 'webhook:123',
			}),
		}

		const runtime = new FlowRuntime({
			dependencies: { adapter: mockAdapter },
		})

		const flow = createFlow('webhook-test').node('webhook', WebhookNode)

		const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry(), {})
		const webhookResult = await stepper.next()

		// Webhook node should complete (not await) and call registerWebhookEndpoint
		expect(webhookResult?.status).toBe('completed')
		expect(mockAdapter.registerWebhookEndpoint).toHaveBeenCalledWith(
			expect.any(String), // runId
			'webhook', // nodeId
		)
		expect(stepper.isDone()).toBe(true)
	})

	it('should handle webhook.request wait node', async () => {
		const runtime = new FlowRuntime({})
		const flow = createFlow('webhook-wait-test').wait('wait_webhook', {
			params: { eventName: 'webhook:webhook_1' },
		})

		const stepper = await createStepper(runtime, flow.toBlueprint(), flow.getFunctionRegistry(), {})
		const waitWebhookResult = await stepper.next()
		expect(waitWebhookResult?.status).toBe('awaiting')
		expect(stepper.isDone()).toBe(false)
	})
})

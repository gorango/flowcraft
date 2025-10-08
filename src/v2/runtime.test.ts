import type { IEventBus, NodeResult } from './types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFlow } from './flow.js'
import { FlowcraftRuntime } from './runtime.js'
import { mockDependencies, mockNodeRegistry } from './test-utils.js'

describe('FlowcraftRuntime', () => {
	let runtime: FlowcraftRuntime
	const mockEventBus: IEventBus & { events: any[] } = {
		events: [],
		emit(eventName, payload) {
			this.events.push({ eventName, payload })
		},
	}

	beforeEach(() => {
		runtime = new FlowcraftRuntime({
			registry: mockNodeRegistry,
			dependencies: mockDependencies,
			environment: 'development',
			eventBus: mockEventBus,
		})
		mockEventBus.events = [] // Clear events before each test
	})

	describe('core execution', () => {
		it('should execute a simple linear blueprint', async () => {
			const flow = createFlow('linear-flow')
			flow.node('start', async (context) => {
				context.set('counter', 1)
				return { output: 1 }
			})
			flow.node('increment', async (context) => {
				const current = context.get('counter') || 0
				const newValue = current + 1
				context.set('counter', newValue)
				return { output: newValue }
			})
			flow.edge('start', 'increment')

			const blueprint = flow.toBlueprint()
			const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

			expect(result.metadata.status).toBe('completed')
			expect(result.context.counter).toBe(2)
		})
	})

	describe('resiliency: retries and fallbacks', () => {
		it('should retry a failing node the specified number of times', async () => {
			let attempts = 0
			const flow = createFlow('retry-flow')
			flow.node(
				'flaky',
				async () => {
					attempts++
					if (attempts < 3) {
						throw new Error('Network failed')
					}
					return { output: 'success' }
				},
				{},
				{ maxRetries: 3 },
			)
			const blueprint = flow.toBlueprint()
			const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

			expect(result.metadata.status).toBe('completed')
			expect(result.context.input).toBe('success')
			expect(attempts).toBe(3)
			// Check for retry events
			const retryEvents = mockEventBus.events.filter(e => e.eventName === 'node:retry')
			expect(retryEvents).toHaveLength(2)
			expect(retryEvents[0].payload.attempt).toBe(1)
			expect(retryEvents[1].payload.attempt).toBe(2)
		})

		it('should execute a fallback if all retries fail', async () => {
			const flow = createFlow('fallback-flow')
			const fallbackFn = async (): Promise<NodeResult> => ({ output: 'fallback success' })
			flow.node(
				'always-fails',
				async () => {
					throw new Error('Permanent failure')
				},
				{},
				{ maxRetries: 2, fallback: 'my-fallback' },
			)
			// Manually add the fallback function to the registry for the test
			const functionRegistry = flow.getFunctionRegistry()
			functionRegistry.set('my-fallback', fallbackFn)

			const blueprint = flow.toBlueprint()
			const result = await runtime.run(blueprint, {}, functionRegistry)

			expect(result.metadata.status).toBe('completed')
			expect(result.context.input).toBe('fallback success')
			// Check for fallback event
			const fallbackEvent = mockEventBus.events.find(e => e.eventName === 'node:fallback')
			expect(fallbackEvent).toBeDefined()
			expect(fallbackEvent.payload.nodeId).toBe('always-fails')
		})

		it('should fail the workflow if retries are exhausted and no fallback is provided', async () => {
			let attempts = 0
			const flow = createFlow('fail-flow')
			flow.node(
				'always-fails',
				async () => {
					attempts++
					throw new Error('Permanent failure')
				},
				{},
				{ maxRetries: 2 },
			)
			const blueprint = flow.toBlueprint()

			await expect(runtime.run(blueprint, {}, flow.getFunctionRegistry())).rejects.toThrow(
				/Permanent failure/,
			)
			expect(attempts).toBe(2)
		})

		it('should respect a timeout and fail the node', async () => {
			const flow = createFlow('timeout-flow')
			flow.node(
				'too-slow',
				async () => {
					await new Promise(resolve => setTimeout(resolve, 100))
					return { output: 'should not be reached' }
				},
				{},
				{ timeout: 20 }, // 20ms timeout
			)
			const blueprint = flow.toBlueprint()

			await expect(runtime.run(blueprint, {}, flow.getFunctionRegistry())).rejects.toThrow(
				/Node execution timed out/,
			)
		})
	})

	describe('observability: event bus', () => {
		it('should emit workflow:start and workflow:finish events', async () => {
			const flow = createFlow('event-flow').node('dummy', async () => ({ output: null }))
			const blueprint = flow.toBlueprint()
			await runtime.run(blueprint, { initial: true }, flow.getFunctionRegistry())

			const startEvent = mockEventBus.events.find(e => e.eventName === 'workflow:start')
			const finishEvent = mockEventBus.events.find(e => e.eventName === 'workflow:finish')

			expect(startEvent).toBeDefined()
			expect(startEvent.payload.blueprintId).toBe('event-flow')
			expect(startEvent.payload.initialContext).toEqual({ initial: true })

			expect(finishEvent).toBeDefined()
			expect(finishEvent.payload.metadata.status).toBe('completed')
		})

		it('should emit node:start, node:finish, and node:error events', async () => {
			const flow = createFlow('node-event-flow')
			flow.node('good-node', async () => ({ output: 'ok' }))
			flow.node(
				'bad-node',
				async () => {
					throw new Error('failed')
				},
				{},
				{ maxRetries: 1 },
			)
			flow.edge('good-node', 'bad-node')
			const blueprint = flow.toBlueprint()

			await expect(runtime.run(blueprint, {}, flow.getFunctionRegistry())).rejects.toThrow()

			// Check good node events
			const goodNodeStart = mockEventBus.events.find(
				e => e.eventName === 'node:start' && e.payload.nodeId === 'good-node',
			)
			const goodNodeFinish = mockEventBus.events.find(
				e => e.eventName === 'node:finish' && e.payload.nodeId === 'good-node',
			)
			expect(goodNodeStart).toBeDefined()
			expect(goodNodeFinish).toBeDefined()
			expect(goodNodeFinish.payload.result.output).toBe('ok')

			// Check bad node events
			const badNodeStart = mockEventBus.events.find(
				e => e.eventName === 'node:start' && e.payload.nodeId === 'bad-node',
			)
			const badNodeError = mockEventBus.events.find(
				e => e.eventName === 'node:error' && e.payload.nodeId === 'bad-node',
			)
			expect(badNodeStart).toBeDefined()
			expect(badNodeError).toBeDefined()
			expect(badNodeError.payload.error).toBe('failed')
		})
	})

	describe('advanced control flow', () => {
		it('should correctly execute a parallel fan-out/fan-in and aggregate results', async () => {
			const flow = createFlow('parallel-join-flow')

			// The branches are defined but not connected to the main flow
			flow.node('branchA', async () => ({ output: 'A' }))
			flow.node('branchB', async () => {
				await new Promise(resolve => setTimeout(resolve, 10)) // Ensure B is slower
				return { output: 'B' }
			})

			// The main flow
			flow.node('start', async () => ({ output: 'start' }))
			flow.parallel('parallel-block', ['branchA', 'branchB']) // Creates the container
			flow.node('end', async ctx => ({ output: `Joined: ${ctx.input.join(',')}` }))

			flow.edge('start', 'parallel-block')
			flow.edge('parallel-block', 'end')

			const blueprint = flow.toBlueprint()
			const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

			expect(result.metadata.status).toBe('completed')
			expect(result.context.input).toBe('Joined: A,B')
		})

		it('should evaluate a conditional edge with the default evaluator and route correctly', async () => {
			const flow = createFlow('default-condition-flow')
			flow.node('start', async () => ({ output: { value: 15, user: { role: 'admin' } } }))
			flow.node('pathA', async () => ({ output: 'A' }))
			flow.node('pathB', async () => ({ output: 'B' }))
			flow.node('defaultPath', async () => ({ output: 'Default' }))

			// Edges from 'start' using the simple evaluator syntax
			flow.edge('start', 'pathA', { condition: 'result.user.role === \'admin\'' })
			flow.edge('start', 'pathB', { condition: 'result.value <= 10' })
			flow.edge('start', 'defaultPath') // Default fallback

			const blueprint = flow.toBlueprint()

			// Test path A (role is admin)
			const resultA = await runtime.run(blueprint, {}, flow.getFunctionRegistry())
			expect(resultA.context.input).toBe('A')

			// Test path B (value is 5)
			const blueprintB = flow.clone('b-test').toBlueprint() // Use a clone for a clean run
			// The runtime will start with the 'start' node, which overwrites the input.
			// To test this properly, we need to modify the start node's output.
			const startNode = blueprintB.nodes.find(n => n.id === 'start')!
			const funcRegistry = flow.getFunctionRegistry()
			funcRegistry.set(startNode.uses, async () => ({ output: { value: 5, user: { role: 'guest' } } }))
			const resultB_run = await runtime.run(blueprintB, {}, funcRegistry)
			expect(resultB_run.context.input).toBe('B')
		})

		it('should use a custom condition evaluator if provided', async () => {
			const customEvaluator = {
				evaluate: vi.fn().mockResolvedValue(true), // Always returns true
			}
			const customRuntime = new FlowcraftRuntime({
				registry: mockNodeRegistry,
				conditionEvaluator: customEvaluator,
			})

			const flow = createFlow('custom-eval-flow')
			flow.node('start', async () => ({ output: 1 }))
			flow.node('pathA', async () => ({ output: 'A' }))
			flow.edge('start', 'pathA', { condition: 'this-will-be-handled-by-mock' })

			const blueprint = flow.toBlueprint()
			await customRuntime.run(blueprint, {}, flow.getFunctionRegistry())

			expect(customEvaluator.evaluate).toHaveBeenCalledWith(
				'this-will-be-handled-by-mock',
				expect.any(Object),
			)
		})
	})
})

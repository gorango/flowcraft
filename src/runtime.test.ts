import type { IEventBus, Middleware, NodeResult } from './types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CancelledWorkflowError, FatalNodeExecutionError } from './errors'
import { createFlow } from './flow'
import { FlowcraftRuntime } from './runtime'
import { mockDependencies, mockNodeRegistry, sleep } from './test-utils'

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
				await context.context.set('counter', 1)
				return { output: 1 }
			})
			flow.node('increment', async (context) => {
				const current = await context.context.get('counter') || 0
				const newValue = current + 1
				await context.context.set('counter', newValue)
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
			expect(result.context.flaky).toBe('success')
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
			expect(result.context['always-fails']).toBe('fallback success')
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

		it('should bypass retries when a FatalNodeExecutionError is thrown', async () => {
			let attempts = 0
			const flow = createFlow('fatal-error-flow')
			flow.node(
				'fatal-node',
				async () => {
					attempts++
					throw new FatalNodeExecutionError('Critical validation failed: Missing userId.', 'fatal-node', 'fatal-error-flow', 'test-execution-id')
				},
				{},
				{ maxRetries: 5 },
			)
			const blueprint = flow.toBlueprint()

			await expect(runtime.run(blueprint, {}, flow.getFunctionRegistry())).rejects.toThrow('Critical validation failed: Missing userId.')
			expect(attempts).toBe(1) // Should execute exactly once, no retries
		})

		it('should bypass the fallback when a FatalNodeExecutionError is thrown', async () => {
			const flow = createFlow('fatal-fallback-flow')
			const fallbackFn = async (): Promise<NodeResult> => ({ output: 'fallback success' })
			flow.node(
				'fatal-node',
				async () => {
					throw new FatalNodeExecutionError('Critical validation failed: Missing userId.', 'fatal-node', 'fatal-fallback-flow', 'test-execution-id')
				},
				{},
				{ maxRetries: 3, fallback: 'my-fallback' },
			)
			// Manually add the fallback function to the registry for the test
			const functionRegistry = flow.getFunctionRegistry()
			functionRegistry.set('my-fallback', fallbackFn)

			const blueprint = flow.toBlueprint()

			await expect(runtime.run(blueprint, {}, functionRegistry)).rejects.toThrow('Critical validation failed: Missing userId.')
			// Check that fallback was never called
			const fallbackEvent = mockEventBus.events.find(e => e.eventName === 'node:fallback')
			expect(fallbackEvent).toBeUndefined()
		})

		it('should attempt retries and call the fallback for a regular Error', async () => {
			let attempts = 0
			const flow = createFlow('regular-error-flow')
			const fallbackFn = async (): Promise<NodeResult> => ({ output: 'fallback success' })
			flow.node(
				'regular-node',
				async () => {
					attempts++
					throw new Error('Regular error')
				},
				{},
				{ maxRetries: 3, fallback: 'my-fallback' },
			)
			// Manually add the fallback function to the registry for the test
			const functionRegistry = flow.getFunctionRegistry()
			functionRegistry.set('my-fallback', fallbackFn)

			const blueprint = flow.toBlueprint()
			const result = await runtime.run(blueprint, {}, functionRegistry)

			expect(result.metadata.status).toBe('completed')
			expect(result.context['regular-node']).toBe('fallback success')
			expect(attempts).toBe(3) // Should attempt all retries
			// Check that fallback was called
			const fallbackEvent = mockEventBus.events.find(e => e.eventName === 'node:fallback')
			expect(fallbackEvent).toBeDefined()
		})
	})

	describe('cancellation', () => {
		it('should gracefully cancel a long-running node', async () => {
			const flow = createFlow('cancellation-flow')
			let nodeFinished = false
			flow.node('long-node', async ({ metadata }) => {
				await sleep(100, metadata.signal) // Use cancellation-aware sleep
				nodeFinished = true
				return { output: 'done' }
			})
			const blueprint = flow.toBlueprint()
			const controller = new AbortController()

			const runPromise = runtime.run(blueprint, {}, flow.getFunctionRegistry(), controller.signal)

			// Abort shortly after starting
			setTimeout(() => controller.abort(), 20)

			// The promise should now reject with a specific cancellation error
			await expect(runPromise).rejects.toThrow(CancelledWorkflowError)
			expect(nodeFinished).toBe(false)
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
		/**
		 * **[NEW]** Tests for State Propagation
		 */
		describe('State Propagation', () => {
			it('should automatically save a node\'s output to the context using its ID', async () => {
				const flow = createFlow('state-prop-flow')
				flow.node('producer', async () => ({ output: { data: 'important' } }))
				flow.node('consumer', async (context) => {
					const producerResult = await context.context.get('producer') as { data: string }
					return { output: `Consumed: ${producerResult.data}` }
				})
				flow.edge('producer', 'consumer')
				const blueprint = flow.toBlueprint()
				const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

				expect(result.metadata.status).toBe('completed')
				expect(result.context.producer).toEqual({ data: 'important' })
				expect(result.context.consumer).toBe('Consumed: important')
			})
		})

		/**
		 * Tests for DAG (Fan-out / Fan-in)
		 */
		describe('DAG Execution (Fan-out / Fan-in)', () => {
			it('should execute a mid-flow fan-out and fan-in correctly', async () => {
				const flow = createFlow('fan-out-flow')
				flow.node('start', async () => ({ output: 'start' }))
				flow.node('branchB', async (ctx) => {
					const startResult = await ctx.context.get('start')
					return { output: `BranchB processed ${startResult}` }
				})
				flow.node('branchC', async (ctx) => {
					const startResult = await ctx.context.get('start')
					return { output: `BranchC processed ${startResult}` }
				})
				flow.node('end', async (ctx) => {
					const bResult = await ctx.context.get('branchB')
					const cResult = await ctx.context.get('branchC')
					return { output: `Converged: [${bResult}] and [${cResult}]` }
				})
				// Fan-out from 'start' to 'branchB' and 'branchC' (default edges)
				flow.edge('start', 'branchB')
				flow.edge('start', 'branchC')
				// Fan-in from branches to 'end'
				flow.edge('branchB', 'end')
				flow.edge('branchC', 'end')

				const blueprint = flow.toBlueprint()
				const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

				expect(result.metadata.status).toBe('completed')
				expect(result.context.start).toBe('start')
				expect(result.context.branchB).toBe('BranchB processed start')
				expect(result.context.branchC).toBe('BranchC processed start')
				expect(result.context.end).toBe('Converged: [BranchB processed start] and [BranchC processed start]')
			})
		})

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
			expect(result.context['parallel-block']).toEqual(['A', 'B'])
			expect(result.context.end).toBe('Joined: A,B')
		})

		describe('Batch Processing', () => {
			it('should process all items sequentially', async () => {
				const processedItems: any[] = []
				const flow = createFlow('batch-sequential-flow')

				flow.node('start', async () => ({ output: [{ id: 1 }, { id: 2 }, { id: 3 }] }))

				// Use the new batch method
				flow.batch('start', 'end', async (context) => {
					const item = context.input as { id: number }
					processedItems.push(item)
					return { output: item.id * 10 }
				}, { concurrency: 1 })

				flow.node('end', async context => ({ output: context.input }))

				const blueprint = flow.toBlueprint()
				const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

				expect(result.metadata.status).toBe('completed')
				expect(result.context.end).toEqual([10, 20, 30])
			})

			it('should process items concurrently', async () => {
				const startTimes: number[] = []
				const finishTimes: number[] = []
				const flow = createFlow('batch-concurrent-flow')

				flow.node('start', async () => ({ output: [{ id: 1 }, { id: 2 }, { id: 3 }] }))

				// Use the new batch method
				flow.batch('start', 'end', async (context) => {
					const item = context.input as { id: number }
					startTimes.push(Date.now())
					await sleep(30 - item.id * 5) // Simulate variable processing time
					finishTimes.push(Date.now())
					return { output: item }
				}, { concurrency: 3 })

				flow.node('end', async context => ({ output: context.input }))

				const blueprint = flow.toBlueprint()
				const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

				// Check that processing started concurrently (start times overlap)
				expect(Math.max(...startTimes) - Math.min(...startTimes)).toBeLessThan(20)
				expect(finishTimes).toHaveLength(3)
				expect(result.context.end).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
			})
		})

		describe('Loop Processing', () => {
			it('should execute a fixed number of times based on maxIterations', async () => {
				const flow = createFlow('loop-max-iterations-flow')

				flow.node('start', async (context) => {
					await context.context.set('counter', 0)
					return { output: null }
				})
				flow.node('increment', async (context) => {
					const current = await context.context.get('counter') || 0
					await context.context.set('counter', current + 1)
					return { output: null }
				})
				flow.node('loop-controller', 'loop-controller', {
					maxIterations: 5,
				}, { joinStrategy: 'any' })
				flow.node('end', async () => ({ output: 'done' }))

				flow.edge('start', 'loop-controller')
				flow.edge('loop-controller', 'increment', { action: 'continue' })
				flow.edge('increment', 'loop-controller')
				flow.edge('loop-controller', 'end', { action: 'break' })

				const blueprint = flow.toBlueprint()
				const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

				expect(result.metadata.status).toBe('completed')
				expect(result.context.counter).toBe(5)
			})

			it('should execute until a condition is no longer met', async () => {
				const flow = createFlow('loop-condition-flow')

				flow.node('start', async (context) => {
					await context.context.set('counter', 0)
					return { output: null }
				})
				flow.node('increment', async (context) => {
					const current = await context.context.get('counter') || 0
					await context.context.set('counter', current + 1)
					return { output: null }
				})
				flow.node('loop-controller', 'loop-controller', {
					maxIterations: 10, // Add a safety max
					condition: 'counter < 3',
				}, { joinStrategy: 'any' })
				flow.node('end', async () => ({ output: 'done' }))

				flow.edge('start', 'loop-controller')
				flow.edge('loop-controller', 'increment', { action: 'continue' })
				flow.edge('increment', 'loop-controller')
				flow.edge('loop-controller', 'end', { action: 'break' })

				const blueprint = flow.toBlueprint()
				const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

				expect(result.metadata.status).toBe('completed')
				expect(result.context.counter).toBe(3)
			})
		})

		describe('Convergence Patterns', () => {
			it('should execute a convergence node only after all parallel branches complete', async () => {
				const flow = createFlow('diamond-convergence-flow')

				flow.node('start', async (context) => {
					await context.context.set('shared_state', { branchA_complete: false, branchB_complete: false })
					return { output: 'start' }
				})
				flow.node('branchA', async (context) => {
					await sleep(10)
					const state = await context.context.get('shared_state') as any
					state.branchA_complete = true
					await context.context.set('shared_state', state)
					return { output: 'A' }
				})
				flow.node('branchB', async (context) => {
					await sleep(20)
					const state = await context.context.get('shared_state') as any
					state.branchB_complete = true
					await context.context.set('shared_state', state)
					return { output: 'B' }
				})
				// This node will only run after the parallel block is fully merged
				flow.node('end', async (context) => {
					const state = await context.context.get('shared_state') as any
					if (state.branchA_complete && state.branchB_complete) {
						return { output: 'success' }
					}
					throw new Error('Convergence failed - branches not complete')
				})

				// This test relies on manual fan-in, which the new execution engine supports.
				flow.edge('start', 'branchA')
				flow.edge('start', 'branchB')
				flow.edge('branchA', 'end')
				flow.edge('branchB', 'end')

				const blueprint = flow.toBlueprint()
				const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

				expect(result.metadata.status).toBe('completed')
				expect(result.context.end).toBe('success')
			})
		})

		describe('Advanced Sub-Workflows', () => {
			it('should isolate context and not leak changes to the parent', async () => {
				// Create sub-workflow
				const subFlow = createFlow('sub-isolator')
				subFlow.node('modify', async (context) => {
					await context.context.set('shared_key', 'sub_value')
					return { output: 'modified' }
				})
				runtime.registerBlueprint(subFlow.toBlueprint())

				// Create parent workflow
				const parentFlow = createFlow('parent-isolation-flow')
				parentFlow.node('start', async (context) => {
					await context.context.set('shared_key', 'parent_value')
					return { output: 'start' }
				})
				parentFlow.subflow('run-sub', 'sub-isolator')
				parentFlow.node('end', async (context) => {
					const value = await context.context.get('shared_key')
					return { output: value }
				})

				parentFlow.edge('start', 'run-sub')
				parentFlow.edge('run-sub', 'end')

				const blueprint = parentFlow.toBlueprint()
				const functionRegistry = new Map([
					...subFlow.getFunctionRegistry(),
					...parentFlow.getFunctionRegistry(),
				])

				const result = await runtime.run(blueprint, {}, functionRegistry)

				expect(result.metadata.status).toBe('completed')
				expect(result.context.end).toBe('parent_value')
			})

			it('should correctly map data and propagate results through nested sub-workflows', async () => {
				// Create child workflow
				const childFlow = createFlow('child-math')
				childFlow.node('add', async (context) => {
					const val = await context.context.get('child_in') || 0
					return { output: val + 1 }
				})
				runtime.registerBlueprint(childFlow.toBlueprint())

				// Create parent workflow that uses the child
				const parentFlow = createFlow('parent-math')
				parentFlow.node('start', async (context) => {
					await context.context.set('parent_in', 10)
					return { output: 10 }
				})
				parentFlow.subflow('run-child', 'child-math', {
					inputs: { child_in: 'parent_in' },
					outputs: { result: 'add' }, // map child 'add' output to parent 'result'
				})
				parentFlow.edge('start', 'run-child')
				runtime.registerBlueprint(parentFlow.toBlueprint())

				// Create grandparent workflow that uses the parent
				const grandparentFlow = createFlow('grandparent-math')
				grandparentFlow.subflow('run-parent', 'parent-math', {
					outputs: { grandparent_result: 'result' },
				})

				const blueprint = grandparentFlow.toBlueprint()
				const functionRegistry = new Map([
					...childFlow.getFunctionRegistry(),
					...parentFlow.getFunctionRegistry(),
					...grandparentFlow.getFunctionRegistry(),
				])

				const result = await runtime.run(blueprint, {}, functionRegistry)
				expect(result.metadata.status).toBe('completed')
				expect(result.context.grandparent_result).toBe(11) // 10 -> child(11) -> parent(11)
			})
		})

		describe('Edge Transformation', () => {
			it('should apply a transformation to data between two nodes', async () => {
				const flow = createFlow('transform-flow')

				flow.node('source', async () => ({ output: 10 }))
				flow.node('target', async context => ({ output: context.input }))
				flow.edge('source', 'target', { transform: 'input * 2' })

				const blueprint = flow.toBlueprint()
				const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

				expect(result.metadata.status).toBe('completed')
				expect(result.context.target).toBe(20)
			})
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
			expect(resultA.context.pathA).toBe('A')

			// Test path B (value is 5)
			const blueprintB = flow.clone('b-test').toBlueprint() // Use a clone for a clean run
			// The runtime will start with the 'start' node, which overwrites the input.
			// To test this properly, we need to modify the start node's output.
			const startNode = blueprintB.nodes.find(n => n.id === 'start')!
			const funcRegistry = flow.getFunctionRegistry()
			funcRegistry.set(startNode.uses, async () => ({ output: { value: 5, user: { role: 'guest' } } }))
			const resultB_run = await runtime.run(blueprintB, {}, funcRegistry)
			expect(resultB_run.context.pathB).toBe('B')
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

	describe('sub-workflows', () => {
		it('should execute a sub-workflow and map inputs/outputs correctly', async () => {
			// 1. Create the sub-workflow
			const subFlow = createFlow('sub-math')
			subFlow.node('add', async (ctx) => {
				const val = (await ctx.context.get('sub_val') as number) || 0
				return { output: val + 10 }
			})
			const subBlueprint = subFlow.toBlueprint()
			runtime.registerBlueprint(subBlueprint)

			// 2. Create the parent workflow
			const parentFlow = createFlow('parent-flow')
			parentFlow.node('start', async () => ({ output: 5 }))
			parentFlow.subflow('run-math', 'sub-math', {
				inputs: { sub_val: 'start' }, // map parent `start` output to sub `sub_val`
				outputs: { final_result: 'add' }, // map sub `add` output to parent `final_result`
			})
			parentFlow.edge('start', 'run-math')
			const parentBlueprint = parentFlow.toBlueprint()
			const functionRegistry = new Map([
				...subFlow.getFunctionRegistry(),
				...parentFlow.getFunctionRegistry(),
			])

			// 3. Run and assert
			const result = await runtime.run(parentBlueprint, {}, functionRegistry)

			expect(result.metadata.status).toBe('completed')
			expect(result.context.final_result).toBe(15) // 5 (from start) + 10 (from sub)
		})

		it('should propagate errors from a sub-workflow', async () => {
			const subFlow = createFlow('sub-fail')
			subFlow.node('fails', async () => {
				throw new Error('sub-workflow failed')
			})
			runtime.registerBlueprint(subFlow.toBlueprint())

			const parentFlow = createFlow('parent-fail')
			parentFlow.subflow('call-sub', 'sub-fail')
			const blueprint = parentFlow.toBlueprint()
			const registry = new Map([...subFlow.getFunctionRegistry(), ...parentFlow.getFunctionRegistry()])

			await expect(runtime.run(blueprint, {}, registry)).rejects.toThrow('sub-workflow failed')
		})
	})

	describe('Advanced Graph Patterns', () => {
		it('should execute a convergence node only once after all its parents have finished', async () => {
			const convergenceFn = vi.fn(async (ctx) => {
				// This is the critical check: ensure outputs from both parents are present when this node runs.
				const branchA_Output = await ctx.context.get('branchA')
				const branchB_Output = await ctx.context.get('branchB')
				expect(branchA_Output).toBe('A done')
				expect(branchB_Output).toBe('B done')
				return { output: `Converged: ${branchA_Output} and ${branchB_Output}` }
			})

			const flow = createFlow('fan-in-test')
			flow.node('start', async () => ({ output: 'start' }))
			flow.node('branchA', async () => {
				await sleep(20) // Slower branch
				return { output: 'A done' }
			})
			flow.node('branchB', async () => {
				await sleep(10) // Faster branch
				return { output: 'B done' }
			})
			flow.node('converge', convergenceFn)

			flow.edge('start', 'branchA')
			flow.edge('start', 'branchB')
			flow.edge('branchA', 'converge')
			flow.edge('branchB', 'converge')

			const blueprint = flow.toBlueprint()
			const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

			// Assert that the convergence node was called exactly one time.
			expect(convergenceFn).toHaveBeenCalledTimes(1)
			expect(result.context.converge).toBe('Converged: A done and B done')
		})

		it('should correctly execute a stateful loop for a fixed number of iterations', async () => {
			const flow = createFlow('stateful-loop-test')
			flow.node('start', async (ctx) => {
				await ctx.context.set('counter', 0)
				return { output: 'started' }
			})
			flow.node('loop-controller', 'loop-controller', {
				maxIterations: 5,
			}, { joinStrategy: 'any' })
			flow.node('increment', async (ctx) => {
				const current = await ctx.context.get('counter') || 0
				await ctx.context.set('counter', current + 1)
				return { output: `incremented to ${current + 1}` }
			})
			flow.node('end', async () => ({ output: 'done' }))

			flow.edge('start', 'loop-controller')
			flow.edge('loop-controller', 'increment', { action: 'continue' })
			flow.edge('increment', 'loop-controller')
			flow.edge('loop-controller', 'end', { action: 'break' })

			const blueprint = flow.toBlueprint()
			const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

			expect(result.metadata.status).toBe('completed')
			// Assert that the state was correctly modified across all iterations.
			expect(result.context.counter).toBe(5)
		})

		it('should process all items in a batch and aggregate the results for the next node', async () => {
			const flow = createFlow('batch-aggregation-test')
			flow.node('start', async () => ({ output: [1, 2, 3] }))

			// Use the new batch method
			flow.batch('start', 'end', async ctx => ({ output: (ctx.input as number) * 10 }), { concurrency: 2 })

			// Ensure 'end' node exists
			flow.node('end', async ctx => ({ output: await ctx.context.get('input') }))

			const blueprint = flow.toBlueprint()
			const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

			expect(result.metadata.status).toBe('completed')
			// Assert that the 'end' node received an array of the processed results.
			expect(result.context.end).toEqual([10, 20, 30])
		})

		it('should correctly map outputs from a sub-workflow without leaking context', async () => {
			// 1. Define and register the sub-workflow
			const subFlow = createFlow('sub-context-test')
			subFlow.node('sub-node', async (ctx) => {
				await ctx.context.set('internal_state', 'should-not-leak')
				await ctx.context.set('final_data', 'important-result')
				// The sub-workflow's final output is what gets mapped
				return { output: await ctx.context.get('final_data') }
			})
			runtime.registerBlueprint(subFlow.toBlueprint())

			// 2. Define the parent workflow
			const parentFlow = createFlow('parent-context-test')
			parentFlow.node('start', async () => ({ output: 'start' }))
			parentFlow.subflow('run-sub', 'sub-context-test', {
				outputs: {
					// Map the sub-workflow's 'sub-node' output to 'parent_key' in this context
					parent_key: 'sub-node',
				},
			})
			parentFlow.edge('start', 'run-sub')

			const blueprint = parentFlow.toBlueprint()
			const result = await runtime.run(
				blueprint,
				{},
				new Map([...parentFlow.getFunctionRegistry(), ...subFlow.getFunctionRegistry()]),
			)

			expect(result.metadata.status).toBe('completed')
			// Assert that the mapped key exists and has the correct value
			expect(result.context.parent_key).toBe('important-result')
			// Assert that the unmapped internal state did not leak into the parent context
			expect(result.context).not.toHaveProperty('internal_state')
			expect(result.context).not.toHaveProperty('final_data')
		})
	})

	describe('middleware', () => {
		it('should execute middleware in LIFO order', async () => {
			const executionLog: string[] = []

			const middleware1: Middleware = {
				beforeNode: async (_ctx, _nodeId) => {
					executionLog.push('before-mw1')
				},
				afterNode: async (_ctx, _nodeId, _result) => {
					executionLog.push('after-mw1')
				},
			}

			const middleware2: Middleware = {
				beforeNode: async (_ctx, _nodeId) => {
					executionLog.push('before-mw2')
				},
				afterNode: async (_ctx, _nodeId, _result) => {
					executionLog.push('after-mw2')
				},
			}

			const runtimeWithMiddleware = new FlowcraftRuntime({
				registry: mockNodeRegistry,
				dependencies: mockDependencies,
				middleware: [middleware1, middleware2],
			})

			const flow = createFlow('middleware-test')
			flow.node('test-node', async () => ({ output: 'test' }))
			const blueprint = flow.toBlueprint()

			await runtimeWithMiddleware.run(blueprint, {}, flow.getFunctionRegistry())

			expect(executionLog).toEqual(['before-mw1', 'before-mw2', 'after-mw2', 'after-mw1'])
		})

		it('should allow beforeNode middleware to modify context visible to the node', async () => {
			const middleware: Middleware = {
				beforeNode: async (_ctx, _nodeId) => {
					await _ctx.set('middleware_added', 'middleware_value')
				},
			}

			const runtimeWithMiddleware = new FlowcraftRuntime({
				registry: mockNodeRegistry,
				dependencies: mockDependencies,
				middleware: [middleware],
			})

			const flow = createFlow('context-modification-test')
			flow.node('test-node', async (context) => {
				const value = await context.context.get('middleware_added')
				return { output: value }
			})
			const blueprint = flow.toBlueprint()

			const result = await runtimeWithMiddleware.run(blueprint, {}, flow.getFunctionRegistry())

			expect(result.context['test-node']).toBe('middleware_value')
		})

		it('should halt execution if beforeNode throws', async () => {
			const middleware: Middleware = {
				beforeNode: async () => {
					throw new Error('Middleware error')
				},
			}

			const runtimeWithMiddleware = new FlowcraftRuntime({
				registry: mockNodeRegistry,
				dependencies: mockDependencies,
				middleware: [middleware],
			})

			const flow = createFlow('middleware-error-test')
			flow.node('test-node', async () => {
				throw new Error('Node should not execute')
			})
			const blueprint = flow.toBlueprint()

			await expect(runtimeWithMiddleware.run(blueprint, {}, flow.getFunctionRegistry())).rejects.toThrow('Middleware error')
		})

		it('should still fail the workflow if afterNode throws', async () => {
			const middleware: Middleware = {
				afterNode: async () => {
					throw new Error('After middleware error')
				},
			}

			const runtimeWithMiddleware = new FlowcraftRuntime({
				registry: mockNodeRegistry,
				dependencies: mockDependencies,
				middleware: [middleware],
			})

			const flow = createFlow('after-middleware-error-test')
			flow.node('test-node', async () => ({ output: 'test' }))
			const blueprint = flow.toBlueprint()

			await expect(runtimeWithMiddleware.run(blueprint, {}, flow.getFunctionRegistry())).rejects.toThrow('After middleware error')
		})

		it('should allow afterNode middleware to inspect the node\'s result', async () => {
			let capturedResult: any = null

			const middleware: Middleware = {
				afterNode: async (_ctx, _nodeId, _result) => {
					capturedResult = _result
				},
			}

			const runtimeWithMiddleware = new FlowcraftRuntime({
				registry: mockNodeRegistry,
				dependencies: mockDependencies,
				middleware: [middleware],
			})

			const flow = createFlow('result-inspection-test')
			flow.node('test-node', async () => ({ output: { data: 'test-data' } }))
			const blueprint = flow.toBlueprint()

			await runtimeWithMiddleware.run(blueprint, {}, flow.getFunctionRegistry())

			expect(capturedResult).toEqual({ output: { data: 'test-data' } })
		})

		it('should execute afterNode hooks even when node fails without fallback', async () => {
			const executionLog: string[] = []

			const middleware: Middleware = {
				beforeNode: async (_ctx, _nodeId) => {
					executionLog.push('before')
				},
				afterNode: async (_ctx, _nodeId, _result) => {
					executionLog.push('after')
				},
			}

			const runtimeWithMiddleware = new FlowcraftRuntime({
				registry: mockNodeRegistry,
				dependencies: mockDependencies,
				middleware: [middleware],
			})

			const flow = createFlow('failure-no-fallback-test')
			flow.node(
				'failing-node',
				async () => {
					throw new Error('Node failed')
				},
				{},
				{ maxRetries: 1 },
			)
			const blueprint = flow.toBlueprint()

			await expect(runtimeWithMiddleware.run(blueprint, {}, flow.getFunctionRegistry())).rejects.toThrow('Node failed')

			expect(executionLog).toEqual(['before', 'after'])
		})

		it('should execute afterNode hooks even when FatalNodeExecutionError occurs', async () => {
			const executionLog: string[] = []

			const middleware: Middleware = {
				beforeNode: async (_ctx, _nodeId) => {
					executionLog.push('before')
				},
				afterNode: async (_ctx, _nodeId, _result) => {
					executionLog.push('after')
				},
			}

			const runtimeWithMiddleware = new FlowcraftRuntime({
				registry: mockNodeRegistry,
				dependencies: mockDependencies,
				middleware: [middleware],
			})

			const flow = createFlow('fatal-error-test')
			flow.node(
				'fatal-node',
				async () => {
					throw new FatalNodeExecutionError('Fatal error', 'fatal-node', 'fatal-error-test', 'test-execution-id')
				},
				{},
				{ maxRetries: 1 },
			)
			const blueprint = flow.toBlueprint()

			await expect(runtimeWithMiddleware.run(blueprint, {}, flow.getFunctionRegistry())).rejects.toThrow('Fatal error')

			expect(executionLog).toEqual(['before', 'after'])
		})

		it('should execute afterNode hooks even when fallback succeeds', async () => {
			const executionLog: string[] = []

			const middleware: Middleware = {
				beforeNode: async (_ctx, _nodeId) => {
					executionLog.push('before')
				},
				afterNode: async (_ctx, _nodeId, _result) => {
					executionLog.push('after')
				},
			}

			const runtimeWithMiddleware = new FlowcraftRuntime({
				registry: mockNodeRegistry,
				dependencies: mockDependencies,
				middleware: [middleware],
			})

			const flow = createFlow('fallback-success-test')
			const fallbackFn = async (): Promise<NodeResult> => ({ output: 'fallback success' })
			flow.node(
				'failing-node',
				async () => {
					throw new Error('Node failed')
				},
				{},
				{ maxRetries: 1, fallback: 'my-fallback' },
			)
			const functionRegistry = flow.getFunctionRegistry()
			functionRegistry.set('my-fallback', fallbackFn)

			const blueprint = flow.toBlueprint()
			const result = await runtimeWithMiddleware.run(blueprint, {}, functionRegistry)

			expect(result.metadata.status).toBe('completed')
			expect(executionLog).toEqual(['before', 'after'])
		})
	})


})

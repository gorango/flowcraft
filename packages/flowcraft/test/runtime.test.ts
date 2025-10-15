import { describe, expect, it, vi } from 'vitest'
import { UnsafeEvaluator } from '../src/evaluator'
import { createFlow } from '../src/flow'
import { FlowRuntime } from '../src/runtime'
import type { IEventBus, Middleware, NodeResult } from '../src/types'

// A mock event bus for testing observability
class MockEventBus implements IEventBus {
	events: { eventName: string; payload: Record<string, any> }[] = []

	emit(eventName: string, payload: Record<string, any>) {
		this.events.push({ eventName, payload })
	}

	has(eventName: string) {
		return this.events.some((e) => e.eventName === eventName)
	}
}

describe('Flowcraft Runtime - Integration Tests', () => {
	// These are high-level integration tests that verify the overall runtime behavior
	// Unit tests for individual components are in test/runtime/

	describe('Core Execution', () => {
		it('should execute a simple linear blueprint', async () => {
			const flow = createFlow('linear')
			flow
				.node('A', async () => ({ output: 'resultA' }))
				.node('B', async (ctx) => ({ output: `${ctx.input}_B` }))
				.edge('A', 'B')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context.B).toBe('resultA_B')
		})

		it('should correctly traverse a DAG with fan-out and fan-in', async () => {
			const flow = createFlow('fan')
			flow
				.node('A', async () => ({ output: 'A' }))
				.node('B', async () => ({ output: 'B' }))
				.node('C', async () => ({ output: 'C' }))
				.node('D', async (ctx) => ({
					output: `input was ${String(ctx.input)}`,
				}))
				.edge('A', 'D')
				.edge('B', 'D')
				.edge('C', 'D')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			// A fan-in node with no explicit `inputs` mapping receives `undefined` as input.
			expect(result.context.D).toBe('input was undefined')
		})

		it('should fail the workflow if a branch fails in a fan-in scenario', async () => {
			const flow = createFlow('stall')
			flow
				.node('A', async () => ({ output: 'A' }))
				.node('B', async () => {
					throw new Error('Fail')
				})
				.node('C', async () => ({ output: 'C' }))
				.node('D', async () => ({ output: 'D' }))
				.edge('A', 'D')
				.edge('B', 'D')
				.edge('C', 'D')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('failed')
			expect(result.errors).toBeDefined()
			expect(result.errors?.some((e) => e.nodeId === 'B')).toBe(true)
			expect(result.context.D).toBeUndefined()
		})

		it('should handle a blueprint with multiple start nodes', async () => {
			const flow = createFlow('multi')
			flow
				.node('A', async () => ({ output: 'A' }))
				.node('B', async () => ({ output: 'B' }))
				.node('C', async (ctx) => ({
					output: `input was ${String(ctx.input)}`,
				}))
				.edge('A', 'C')
				.edge('B', 'C')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			// A fan-in node with no explicit `inputs` mapping receives `undefined` as input.
			expect(result.context.C).toBe('input was undefined')
		})

		it('should correctly execute a graph with a cycle when strict mode is off', async () => {
			const flow = createFlow('cycle')
			flow
				.node('A', async () => ({ output: 'A' }))
				.node('B', async () => ({ output: 'B' }))
				.edge('A', 'B')
				.edge('B', 'A')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(
				flow.toBlueprint(),
				{},
				{ strict: false, functionRegistry: flow.getFunctionRegistry() },
			)

			// The runtime's `completedNodes` check prevents infinite loops.
			expect(result.status).toBe('completed')
		})

		it('should correctly break out of a loop when the condition is met', async () => {
			let executionCount = 0
			const flow = createFlow('loop-test')
			flow
				.node('initialize', async ({ context }) => {
					await context.set('loop_count', 0)
					await context.set('last_action', null)
					return { output: 'initialized' }
				})
				.node('decide', async ({ context }) => {
					executionCount++
					const loopCount = (await context.get('loop_count')) || 0
					const lastAction = await context.get('last_action')
					// For this test, always return 'search' to trigger the loop
					await context.set('last_action', 'search')
					return {
						action: 'search',
						output: `decide_${loopCount}_${lastAction}`,
					}
				})
				.node('search', async ({ context }) => {
					const currentLoopCount = (await context.get('loop_count')) || 0
					await context.set('loop_count', currentLoopCount + 1)
					return { output: `search_${currentLoopCount + 1}` }
				})
				.node('answer', async () => {
					return { output: 'final_answer' }
				})
				.loop('research', {
					startNodeId: 'decide',
					endNodeId: 'search',
					condition: "loop_count < 2 && last_action !== 'answer'",
				})
				.edge('initialize', 'decide')
				.edge('decide', 'search', { action: 'search' })
				.edge('decide', 'answer', { action: 'answer' })
				.edge('search', 'decide')
				.edge('research-loop', 'answer', { action: 'break' })

			const runtime = new FlowRuntime({ evaluator: new UnsafeEvaluator() })
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			// The loop should run 2 times (loop_count goes from 0 to 1 to 2)
			// After 2 iterations, the condition should be false and it should break
			expect(executionCount).toBe(2) // decide should only run 2 times
			expect(result.status).toBe('completed')
			expect(result.context.answer).toBe('final_answer')
		})

		it('should throw an error on a graph with a cycle when strict mode is on', async () => {
			const flow = createFlow('cycle')
			flow
				.node('A', async () => ({ output: 'A' }))
				.node('B', async () => ({ output: 'B' }))
				.edge('A', 'B')
				.edge('B', 'A')

			const runtime = new FlowRuntime({})
			const promise = runtime.run(
				flow.toBlueprint(),
				{},
				{ strict: true, functionRegistry: flow.getFunctionRegistry() },
			)

			await expect(promise).rejects.toThrow(/Cycles are not allowed/)
		})
	})

	describe('State Management & Data Flow', () => {
		it("should automatically save a node's output to the context using its ID", async () => {
			const flow = createFlow('save').node('A', async () => ({
				output: 'test',
			}))
			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.A).toBe('test')
		})

		it('should correctly resolve a simple string `inputs` mapping', async () => {
			const flow = createFlow('input')
			flow
				.node('A', async () => ({ output: 'data' }))
				.node('B', async (ctx) => ({ output: `${ctx.input}_B` }), {
					inputs: 'A',
				})
				.edge('A', 'B')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.B).toBe('data_B')
		})

		it('should correctly resolve a complex object `inputs` mapping', async () => {
			const flow = createFlow('complex')
			flow
				.node('A', async () => ({ output: { key: 'value' } }))
				.node('B', async (ctx) => ({ output: `${ctx.input.data.key}_B` }), {
					inputs: { data: 'A' },
				})
				.edge('A', 'B')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.B).toBe('value_B')
		})

		it('should use the single-predecessor output as `input` if no mapping is provided', async () => {
			const flow = createFlow('single')
			flow
				.node('A', async () => ({ output: 'data' }))
				.node('B', async (ctx) => ({ output: `${ctx.input}_B` }))
				.edge('A', 'B')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.B).toBe('data_B')
		})

		it('should apply an edge `transform` expression to the data flow', async () => {
			const flow = createFlow('transform')
			flow
				.node('A', async () => ({ output: 10 }))
				.node('B', async (ctx) => ({ output: ctx.input }))
				.edge('A', 'B', { transform: 'input * 2' })

			const runtime = new FlowRuntime({ evaluator: new UnsafeEvaluator() })
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.B).toBe(20)
		})

		it('should handle "undefined" as a valid node output and save it to the context', async () => {
			const flow = createFlow('undefined').node('A', async () => ({
				output: undefined,
			}))
			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context).toHaveProperty('A')
			expect(result.context.A).toBeUndefined()
		})

		it('should not have input for a node with multiple predecessors and no explicit "inputs" mapping', async () => {
			const flow = createFlow('multi-no-input')
			flow
				.node('A', async () => ({ output: 'A' }))
				.node('B', async () => ({ output: 'B' }))
				.node('C', async (ctx) => ({
					output: ctx.input === undefined ? 'no-input' : 'had-input',
				}))
				.edge('A', 'C')
				.edge('B', 'C')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.C).toBe('no-input')
		})
	})

	describe('Control Flow', () => {
		it('should follow an edge based on the returned `action`', async () => {
			const flow = createFlow('action')
			flow
				.node('A', async () => ({ output: 'A', action: 'success' }))
				.node('B', async () => ({ output: 'B' }))
				.node('C', async () => ({ output: 'C' }))
				.edge('A', 'B', { action: 'success' })
				.edge('A', 'C', { action: 'fail' })

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.B).toBe('B')
			expect(result.context.C).toBeUndefined()
		})

		it('should evaluate an edge `condition` and route correctly if true', async () => {
			const flow = createFlow('condition-true')
			flow
				.node('A', async () => ({ output: { status: 'OK' } }))
				.node('B', async () => ({ output: 'B' }))
				.node('C', async () => ({ output: 'C' }))
				.edge('A', 'B', { condition: "result.output.status === 'OK'" })
				.edge('A', 'C', { condition: "result.output.status === 'ERROR'" })

			const runtime = new FlowRuntime({ evaluator: new UnsafeEvaluator() })
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.B).toBe('B')
			expect(result.context.C).toBeUndefined()
		})

		it('should not follow a conditional edge if the condition is false', async () => {
			const flow = createFlow('condition-false')
			flow
				.node('A', async () => ({ output: 'A' }))
				.node('B', async () => ({ output: 'B' }))
				.node('C', async () => ({ output: 'C' }))
				.edge('A', 'B', { condition: '1 === 2' }) // false
				.edge('A', 'C')

			const runtime = new FlowRuntime({ evaluator: new UnsafeEvaluator() })
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.B).toBeUndefined()
			expect(result.context.C).toBe('C')
		})

		it('should follow the default (unconditional) edge if no other paths match', async () => {
			const flow = createFlow('default')
			flow
				.node('A', async () => ({ output: 'A', action: 'unknown' }))
				.node('B', async () => ({ output: 'B' }))
				.node('C', async () => ({ output: 'C' }))
				.edge('A', 'B', { action: 'known' })
				.edge('A', 'C') // default edge

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.B).toBeUndefined()
			expect(result.context.C).toBe('C')
		})
	})

	describe('Extensibility & Observability', () => {
		it('should wrap execution with `aroundNode` middleware in the correct LIFO order', async () => {
			const order: string[] = []
			const middleware: Middleware[] = [
				{
					aroundNode: async (_ctx, _nodeId, next) => {
						order.push('before1')
						const result = await next()
						order.push('after1')
						return result
					},
				},
				{
					aroundNode: async (_ctx, _nodeId, next) => {
						order.push('before2')
						const result = await next()
						order.push('after2')
						return result
					},
				},
			]

			const flow = createFlow('mw-around').node('A', async () => {
				order.push('exec')
				return { output: 'A' }
			})
			const runtime = new FlowRuntime({ middleware })
			await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(order).toEqual(['before1', 'before2', 'exec', 'after2', 'after1'])
		})

		it('should allow `aroundNode` to short-circuit execution by not calling `next()`', async () => {
			const middleware: Middleware[] = [
				{
					aroundNode: async () => ({ output: 'short-circuit' }),
				},
			]
			const flow = createFlow('mw-short').node('A', async () => ({
				output: 'should-not-run',
			}))
			const runtime = new FlowRuntime({ middleware })
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.A).toBe('short-circuit')
		})

		it('should call `beforeNode` and `afterNode` middleware for each node', async () => {
			const beforeSpy = vi.fn()
			const afterSpy = vi.fn()
			const middleware: Middleware[] = [{ beforeNode: beforeSpy, afterNode: afterSpy }]

			const flow = createFlow('mw-before-after').node('A', async () => ({
				output: 'A',
			}))
			const runtime = new FlowRuntime({ middleware })
			await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(beforeSpy).toHaveBeenCalledOnce()
			expect(afterSpy).toHaveBeenCalledOnce()
		})

		it('should call `afterNode` even if the node fails', async () => {
			const afterSpy = vi.fn()
			const middleware: Middleware[] = [{ afterNode: afterSpy }]
			const flow = createFlow('mw-after-fail').node('A', async () => {
				throw new Error('Fail')
			})
			const runtime = new FlowRuntime({ middleware })
			await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(afterSpy).toHaveBeenCalledOnce()
		})

		it('should emit `workflow:start` and `workflow:finish` events', async () => {
			const eventBus = new MockEventBus()
			const flow = createFlow('events-workflow').node('A', async () => ({
				output: 'A',
			}))
			const runtime = new FlowRuntime({ eventBus })
			await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(eventBus.has('workflow:start')).toBe(true)
			expect(eventBus.has('workflow:finish')).toBe(true)
		})

		it('should emit `node:start`, `node:finish`, `node:retry`, and `node:error` events', async () => {
			const eventBus = new MockEventBus()
			let attempts = 0
			const flow = createFlow('events-node')
			flow
				.node(
					'A',
					async () => {
						attempts++
						if (attempts < 2) throw new Error('Retry me')
						return { output: 'A' }
					},
					{ config: { maxRetries: 2 } },
				)
				.node('B', async () => {
					throw new Error('Fail me')
				})

			const runtime = new FlowRuntime({ eventBus })
			await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(eventBus.has('node:start')).toBe(true)
			expect(eventBus.has('node:finish')).toBe(true)
			expect(eventBus.has('node:retry')).toBe(true)
			expect(eventBus.has('node:error')).toBe(true)
		})

		it('should correctly pass dependencies to a NodeFunction', async () => {
			const deps = { db: { query: () => 'data' } }
			let capturedDeps: any
			const flow = createFlow('deps-fn').node('A', async (ctx) => {
				capturedDeps = ctx.dependencies
				return { output: 'A' }
			})
			const runtime = new FlowRuntime({ dependencies: deps })
			await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(capturedDeps.db).toBe(deps.db)
			expect(capturedDeps.logger).toBeDefined()
		})
	})

	describe('Cancellation', () => {
		it('should result in a cancelled status if the signal is aborted mid-flight', async () => {
			const controller = new AbortController()
			const flow = createFlow('cancel-me')
			flow
				.node('A', async (): Promise<NodeResult<string>> => {
					controller.abort() // Abort after the first node starts
					return { output: 'A' }
				})
				.node(
					'B',
					async (): Promise<NodeResult<string>> =>
						new Promise((resolve) => setTimeout(() => resolve({ output: 'B' }), 50)),
				)
				.edge('A', 'B')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(
				flow.toBlueprint(),
				{},
				{
					signal: controller.signal,
					functionRegistry: flow.getFunctionRegistry(),
				},
			)

			expect(result.status).toBe('cancelled')
		})

		it('should pass the AbortSignal to the NodeContext', async () => {
			const controller = new AbortController()
			let signalReceived: AbortSignal | undefined
			const flow = createFlow('cancel-signal').node('A', async (ctx) => {
				signalReceived = ctx.signal
				return { output: 'A' }
			})

			const runtime = new FlowRuntime({})
			await runtime.run(
				flow.toBlueprint(),
				{},
				{
					signal: controller.signal,
					functionRegistry: flow.getFunctionRegistry(),
				},
			)

			expect(signalReceived).toBe(controller.signal)
		})
	})
})

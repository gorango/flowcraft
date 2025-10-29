import { describe, expect, it, vi } from 'vitest'
import { UnsafeEvaluator } from '../src/evaluator'
import { createFlow } from '../src/flow'
import { FlowRuntime } from '../src/runtime'

import type { FlowcraftEvent, IEventBus, Middleware, NodeResult } from '../src/types'

// A mock event bus for testing observability
class MockEventBus implements IEventBus {
	events: { type: string; payload: Record<string, any> }[] = []

	async emit(event: FlowcraftEvent) {
		this.events.push({ type: event.type, payload: event.payload })
	}

	has(eventType: string) {
		return this.events.some((e) => e.type === eventType)
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
			expect(result.context['_outputs.B']).toBe('resultA_B')
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
			expect(result.context['_outputs.D']).toBe('input was undefined')
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
			expect(result.context['_outputs.D']).toBeUndefined()
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
			expect(result.context['_outputs.C']).toBe('input was undefined')
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
			const loopBodyMock = vi.fn(async ({ context }) => {
				const currentCount = (await context.get('counter')) || 0
				await context.set('counter', currentCount + 1)
				return { output: `iteration_${currentCount + 1}` }
			})

			const flow = createFlow('loop-break-test')
				.node('start', async ({ context }) => {
					await context.set('counter', 0)
					return { output: 0 }
				})
				.node('loopBody', loopBodyMock)
				.node('end', async () => ({ output: 'finished' }))
				.loop('mainLoop', {
					startNodeId: 'loopBody',
					endNodeId: 'loopBody',
					condition: 'counter < 2',
				})
				.edge('start', 'loopBody')
				// The break path is the default edge (no action) from the loop controller
				.edge('mainLoop-loop', 'end')

			const runtime = new FlowRuntime({ evaluator: new UnsafeEvaluator() })
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(loopBodyMock).toHaveBeenCalledTimes(2)
			expect(result.context.counter).toBe(2)
			expect(result.context['_outputs.end']).toBe('finished')
		})

		it('should execute fallback node when main node fails', async () => {
			const flow = createFlow('fallback-test')
			flow
				.node(
					'A',
					async () => {
						throw new Error('Main failed')
					},
					{ config: { fallback: 'B' } },
				)
				.node('B', async () => ({ output: 'fallback success' }))

			const blueprint = flow.toBlueprint()
			const runtime = new FlowRuntime({})
			const result = await runtime.run(blueprint, {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.B']).toBe('fallback success')
			expect(result.errors).toBeUndefined()
		})

		it('should retry a node and execute fallback after max retries exceeded', async () => {
			const failingNodeImpl = vi.fn().mockRejectedValue(new Error('Failing permanently'))
			const fallbackNodeImpl = vi.fn().mockResolvedValue({ output: 'fallback-success' })

			const flow = createFlow('retry-fallback-flow')
				.node('start', async () => ({ output: 'start' }))
				.node('failingNode', failingNodeImpl, { config: { maxRetries: 3, fallback: 'fallbackNode' } })
				.node('fallbackNode', fallbackNodeImpl)
				.node('endNode', async ({ input }) => ({ output: `end-with-${input}` }))
				.edge('start', 'failingNode')
				// This edge is for the successful case, which won't be taken.
				.edge('failingNode', 'endNode')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(failingNodeImpl).toHaveBeenCalledTimes(3)
			expect(fallbackNodeImpl).toHaveBeenCalledTimes(1)
			expect(result.context['_outputs.endNode']).toBe('end-with-fallback-success')
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

		it('should respect concurrency limit when specified', async () => {
			let concurrentCount = 0
			let maxConcurrent = 0
			const flow = createFlow('concurrency-test')
			// Create 5 nodes that can run in parallel
			for (let i = 0; i < 5; i++) {
				flow.node(`node${i}`, async () => {
					concurrentCount++
					maxConcurrent = Math.max(maxConcurrent, concurrentCount)
					await new Promise((resolve) => setTimeout(resolve, 50)) // Simulate work
					concurrentCount--
					return { output: `result${i}` }
				})
			}

			const runtime = new FlowRuntime({})
			const result = await runtime.run(
				flow.toBlueprint(),
				{},
				{ functionRegistry: flow.getFunctionRegistry(), concurrency: 2 },
			)

			expect(result.status).toBe('completed')
			expect(maxConcurrent).toBeLessThanOrEqual(2) // Should not exceed concurrency limit
		})

		it('should allow unlimited concurrency when not specified', async () => {
			let concurrentCount = 0
			let maxConcurrent = 0
			const flow = createFlow('unlimited-concurrency')
			// Create 5 nodes that can run in parallel
			for (let i = 0; i < 4; i++) {
				flow.node(`node${i}`, async () => {
					concurrentCount++
					maxConcurrent = Math.max(maxConcurrent, concurrentCount)
					await new Promise((resolve) => setTimeout(resolve, 50)) // Simulate work
					concurrentCount--
					return { output: `result${i}` }
				})
			}

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(maxConcurrent).toBe(4) // All nodes should run in parallel
		})

		it('should enforce sequential execution with concurrency: 1', async () => {
			let concurrentCount = 0
			let maxConcurrent = 0
			const flow = createFlow('sequential')
			// Create 3 nodes that can run in parallel
			for (let i = 0; i < 3; i++) {
				flow.node(`node${i}`, async () => {
					concurrentCount++
					maxConcurrent = Math.max(maxConcurrent, concurrentCount)
					await new Promise((resolve) => setTimeout(resolve, 50)) // Simulate work
					concurrentCount--
					return { output: `result${i}` }
				})
			}

			const runtime = new FlowRuntime({})
			const result = await runtime.run(
				flow.toBlueprint(),
				{},
				{ functionRegistry: flow.getFunctionRegistry(), concurrency: 1 },
			)

			expect(result.status).toBe('completed')
			expect(maxConcurrent).toBe(1) // Should be strictly sequential
		})

		it('should execute a flow with conditional edges and context', async () => {
			const flow = createFlow('conditional-flow')
				.node('A', async ({ context }) => {
					await context.set('shared_value', 42)
					return { output: 'start' }
				})
				.node('B', async () => ({
					output: true,
					action: 'path-c', // Deterministically choose one path
				}))
				.node('C', async ({ context }) => {
					const val = await context.get('shared_value')
					return { output: `C received ${val}` }
				})
				.node('D', async () => ({ output: 'D should not run' }))
				.edge('A', 'B')
				.edge('B', 'C', { action: 'path-c' })
				.edge('B', 'D', { action: 'path-d' })

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.C']).toBe('C received 42')
			expect(result.context['_outputs.D']).toBeUndefined()
			expect(result.context.shared_value).toBe(42)
		})
	})

	describe('State Management & Data Flow', () => {
		it("should automatically save a node's output to the context using its ID", async () => {
			const flow = createFlow('save').node('A', async () => ({
				output: 'test',
			}))
			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context['_outputs.A']).toBe('test')
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

			expect(result.context['_outputs.B']).toBe('data_B')
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

			expect(result.context['_outputs.B']).toBe('value_B')
		})

		it('should use the single-predecessor output as `input` if no mapping is provided', async () => {
			const flow = createFlow('single')
			flow
				.node('A', async () => ({ output: 'data' }))
				.node('B', async (ctx) => ({ output: `${ctx.input}_B` }))
				.edge('A', 'B')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context['_outputs.B']).toBe('data_B')
		})

		it('should apply an edge `transform` expression to the data flow', async () => {
			const flow = createFlow('transform')
			flow
				.node('A', async () => ({ output: 10 }))
				.node('B', async (ctx) => ({ output: ctx.input }))
				.edge('A', 'B', { transform: 'input * 2' })

			const runtime = new FlowRuntime({ evaluator: new UnsafeEvaluator() })
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context['_outputs.B']).toBe(20)
		})

		it('should handle "undefined" as a valid node output and save it to the context', async () => {
			const flow = createFlow('undefined').node('A', async () => ({
				output: undefined,
			}))
			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context).toHaveProperty('_outputs.A')
			expect(result.context['_outputs.A']).toBeUndefined()
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

			expect(result.context['_outputs.C']).toBe('no-input')
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

			expect(result.context['_outputs.B']).toBe('B')
			expect(result.context['_outputs.C']).toBeUndefined()
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

			expect(result.context['_outputs.B']).toBe('B')
			expect(result.context['_outputs.C']).toBeUndefined()
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

			expect(result.context['_outputs.B']).toBeUndefined()
			expect(result.context['_outputs.C']).toBe('C')
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

			expect(result.context['_outputs.B']).toBeUndefined()
			expect(result.context['_outputs.C']).toBe('C')
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

			expect(result.context['_outputs.A']).toBe('short-circuit')
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

	describe('Boundary Conditions', () => {
		describe('Blueprint Structure', () => {
			it.each([
				['empty blueprint', { id: 'empty', nodes: [], edges: [] }],
				['blueprint with no nodes', { id: 'no-nodes', nodes: [], edges: [] }],
				[
					'blueprint with nodes but no edges',
					() => {
						const flow = createFlow('nodes-no-edges')
						flow.node('A', async () => ({ output: 'A' }))
						return flow.toBlueprint()
					},
				],
			])('should handle %s gracefully', async (_description, blueprintOrFactory) => {
				const blueprint = typeof blueprintOrFactory === 'function' ? blueprintOrFactory() : blueprintOrFactory
				const runtime = new FlowRuntime({})
				const result = await runtime.run(blueprint, {}, {})

				expect(['completed', 'failed']).toContain(result.status)
			})
		})

		describe('Node IDs and Names', () => {
			it.each([
				['empty string ID', ''],
				['whitespace ID', '   '],
				['special characters', 'node@#$%^&*()'],
				['unicode characters', '节点🚀'],
				['very long ID', 'a'.repeat(1000)],
				['ID with dots', 'node.subnode'],
				['ID with slashes', 'node/sub/node'],
			])('should handle node ID: %s', async (_description, nodeId) => {
				const flow = createFlow('node-id-test')
				flow.node(nodeId, async () => ({ output: 'test' }))

				const runtime = new FlowRuntime({})
				const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

				expect(result.status).toBe('completed')
				if (nodeId.trim() !== '') {
					expect(result.context[`_outputs.${nodeId}`]).toBe('test')
				}
			})
		})

		describe('Input/Output Data', () => {
			it.each([
				['null output', null],
				['undefined output', undefined],
				['empty string', ''],
				['very long string', 'a'.repeat(10000)],
				['empty object', {}],
				['deeply nested object', { a: { b: { c: { d: { e: 'deep' } } } } }],
				['large array', Array.from({ length: 1000 }, (_, i) => i)],
				['mixed types', { str: 'string', num: 42, bool: true, arr: [1, 2], obj: { nested: 'value' } }],
			])('should handle %s as node output', async (_description, output) => {
				const flow = createFlow('output-test')
				flow.node('A', async () => ({ output }))

				const runtime = new FlowRuntime({})
				const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

				expect(result.status).toBe('completed')
				expect(result.context['_outputs.A']).toBe(output)
			})

			it.each([
				['null input', null],
				['undefined input', undefined],
				['empty string', ''],
				['large number', Number.MAX_SAFE_INTEGER],
				['negative number', -Number.MAX_SAFE_INTEGER],
				['NaN', NaN],
				['Infinity', Infinity],
				['empty array', []],
				['sparse array', Array(10)],
			])('should handle %s as initial context value', async (_description, value) => {
				const flow = createFlow('context-test')
				flow.node('A', async ({ context }) => {
					const val = await context.get('testKey')
					return { output: val }
				})

				const runtime = new FlowRuntime({})
				const result = await runtime.run(
					flow.toBlueprint(),
					{ testKey: value },
					{ functionRegistry: flow.getFunctionRegistry() },
				)

				expect(result.status).toBe('completed')
				expect(result.context['_outputs.A']).toBe(value)
			})
		})

		describe('Concurrency and Performance', () => {
			it.each([
				[1, 'single concurrency'],
				[2, 'low concurrency'],
				[5, 'medium concurrency'],
				[10, 'high concurrency'],
				[0, 'zero concurrency'],
			])('should handle concurrency limit of %d (%s)', async (concurrency, _description) => {
				const flow = createFlow('concurrency-test')
				const nodeCount = Math.max(1, Math.min(concurrency * 2, 20)) // Don't create too many nodes, at least 1

				for (let i = 0; i < nodeCount; i++) {
					flow.node(`node${i}`, async () => {
						await new Promise((resolve) => setTimeout(resolve, 10)) // Small delay
						return { output: `result${i}` }
					})
				}

				const runtime = new FlowRuntime({})
				const result = await runtime.run(
					flow.toBlueprint(),
					{},
					{
						functionRegistry: flow.getFunctionRegistry(),
						concurrency,
					},
				)

				expect(result.status).toBe('completed')
			})

			it('should handle negative concurrency gracefully', async () => {
				const flow = createFlow('negative-concurrency')
				flow.node('A', async () => ({ output: 'A' }))

				const runtime = new FlowRuntime({})
				const result = await runtime.run(
					flow.toBlueprint(),
					{},
					{
						functionRegistry: flow.getFunctionRegistry(),
						concurrency: -1,
					},
				)

				expect(result.status).toBe('completed')
			})
		})

		describe('Graph Size Limits', () => {
			it('should handle blueprint with maximum reasonable number of nodes', async () => {
				const flow = createFlow('large-graph')
				const nodeCount = 100 // Reasonable limit for testing

				for (let i = 0; i < nodeCount; i++) {
					flow.node(`node${i}`, async () => ({ output: i }))
					if (i > 0) {
						flow.edge(`node${i - 1}`, `node${i}`)
					}
				}

				const runtime = new FlowRuntime({})
				const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

				expect(result.status).toBe('completed')
				expect(result.context[`_outputs.node${nodeCount - 1}`]).toBe(nodeCount - 1)
			})

			it('should handle blueprint with complex edge patterns', async () => {
				const flow = createFlow('complex-edges')
				const nodeCount = 10

				// Create nodes
				for (let i = 0; i < nodeCount; i++) {
					flow.node(`node${i}`, async () => ({ output: i }))
				}

				// Create multiple edges from each node to create a dense graph
				for (let i = 0; i < nodeCount; i++) {
					for (let j = i + 1; j < nodeCount; j++) {
						flow.edge(`node${i}`, `node${j}`)
					}
				}

				const runtime = new FlowRuntime({})
				const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

				expect(result.status).toBe('completed')
			})
		})

		describe('Error Conditions', () => {
			it.each([
				['node throws string error', 'string error'],
				['node throws Error object', new Error('error object')],
				['node throws null', null],
				['node throws undefined', undefined],
				['node throws number', 42],
				['node throws object', { error: 'object' }],
			])('should handle node that throws %s', async (_description, error) => {
				const flow = createFlow('error-test')
				flow.node('A', async () => {
					throw error
				})

				const runtime = new FlowRuntime({})
				const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

				expect(result.status).toBe('failed')
				expect(result.errors).toBeDefined()
				expect(result.errors?.length).toBeGreaterThan(0)
			})

			it('should handle node function that returns invalid result', async () => {
				const flow = createFlow('invalid-result')
				flow.node('A', async () => {
					// Return something that's not a NodeResult
					return 'invalid result' as any
				})

				const runtime = new FlowRuntime({})
				const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

				// Should either complete or fail gracefully
				expect(['completed', 'failed']).toContain(result.status)
			})
		})

		describe('Context Operations', () => {
			it.each([
				['set with null value', null],
				['set with undefined value', undefined],
				['set with complex object', { nested: { deep: { value: 42 } } }],
				[
					'set with circular reference',
					(() => {
						const obj: any = { prop: 'value' }
						obj.self = obj
						return obj
					})(),
				],
			])('should handle context.set with %s', async (_description, value) => {
				const flow = createFlow('context-set-test')
				flow.node('A', async ({ context }) => {
					await context.set('testKey', value)
					return { output: 'done' }
				})
				flow.node('B', async ({ context }) => {
					const val = await context.get('testKey')
					return { output: val }
				})
				flow.edge('A', 'B')

				const runtime = new FlowRuntime({})
				const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

				expect(result.status).toBe('completed')
				expect(result.context['_outputs.B']).toBe(value)
			})
		})
	})

	describe.skip('Concurrency and Race Conditions', () => {
		it('should handle concurrent context reads without race conditions', async () => {
			const flow = createFlow('concurrent-reads')
			const readCount = 10

			// Initialize context
			flow.node('init', async ({ context }) => {
				await context.set('counter', 0)
				return { output: 'initialized' }
			})

			// Create multiple nodes that read the same context value
			for (let i = 0; i < readCount; i++) {
				flow.node(`reader${i}`, async ({ context }) => {
					const value = await context.get('counter')
					return { output: value }
				})
			}

			// Connect all readers to init
			for (let i = 0; i < readCount; i++) {
				flow.edge('init', `reader${i}`)
			}

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			// All readers should get the same initial value
			for (let i = 0; i < readCount; i++) {
				expect(result.context[`_outputs.reader${i}`]).toBe(0)
			}
		})

		it('should handle concurrent context writes safely', async () => {
			const flow = createFlow('concurrent-writes')
			const writeCount = 5

			// Create multiple nodes that increment a counter
			for (let i = 0; i < writeCount; i++) {
				flow.node(`writer${i}`, async ({ context }) => {
					const current = (await context.get('counter')) || 0
					await context.set('counter', current + 1)
					return { output: `incremented_to_${current + 1}` }
				})
			}

			const runtime = new FlowRuntime({})
			const result = await runtime.run(
				flow.toBlueprint(),
				{ counter: 0 },
				{ functionRegistry: flow.getFunctionRegistry() },
			)

			expect(result.status).toBe('completed')
			// Due to concurrent writes, the final counter value might not be exactly writeCount
			// But each node should have operated on some valid state
			expect(result.context.counter).toBeGreaterThanOrEqual(0)
			expect(result.context.counter).toBeLessThanOrEqual(writeCount)
		})

		it('should maintain data integrity during parallel execution', async () => {
			const flow = createFlow('data-integrity')
			const nodeCount = 20

			// Create nodes that append to an array in context
			for (let i = 0; i < nodeCount; i++) {
				flow.node(`appender${i}`, async ({ context }) => {
					const arr = (await context.get('array')) || []
					const newArr = [...arr, i]
					await context.set('array', newArr)
					return { output: `added_${i}` }
				})
			}

			const runtime = new FlowRuntime({})
			const result = await runtime.run(
				flow.toBlueprint(),
				{ array: [] },
				{
					functionRegistry: flow.getFunctionRegistry(),
					concurrency: 5, // Allow parallel execution
				},
			)

			expect(result.status).toBe('completed')
			// The array should contain all values, though possibly in different orders due to concurrency
			const finalArray = result.context.array
			expect(finalArray).toHaveLength(nodeCount)
			expect(finalArray.sort()).toEqual(Array.from({ length: nodeCount }, (_, i) => i))
		})

		it('should handle race conditions in conditional logic', async () => {
			const flow = createFlow('conditional-race')
			const executionOrder: string[] = []

			// Two nodes that both try to set a flag and check conditions
			flow.node('checker1', async ({ context }) => {
				executionOrder.push('checker1-start')
				const flag = await context.get('processed')
				if (!flag) {
					await context.set('processed', true)
					await context.set('winner', 'checker1')
				}
				executionOrder.push('checker1-end')
				return { output: 'done1' }
			})

			flow.node('checker2', async ({ context }) => {
				executionOrder.push('checker2-start')
				const flag = await context.get('processed')
				if (!flag) {
					await context.set('processed', true)
					await context.set('winner', 'checker2')
				}
				executionOrder.push('checker2-end')
				return { output: 'done2' }
			})

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			// One and only one should have set the winner
			expect(result.context.winner).toBeDefined()
			expect(['checker1', 'checker2']).toContain(result.context.winner)
			expect(result.context.processed).toBe(true)
		})

		it('should prevent race conditions in shared resource access', async () => {
			const flow = createFlow('shared-resource')
			const accessCount = 50
			let concurrentAccesses = 0
			let maxConcurrentAccesses = 0

			// Create nodes that simulate accessing a shared resource
			for (let i = 0; i < accessCount; i++) {
				flow.node(`accessor${i}`, async ({ context }) => {
					concurrentAccesses++
					maxConcurrentAccesses = Math.max(maxConcurrentAccesses, concurrentAccesses)

					// Simulate resource access time
					await new Promise((resolve) => setTimeout(resolve, Math.random() * 10))

					concurrentAccesses--
					const accessId = (await context.get('nextId')) || 0
					await context.set('nextId', accessId + 1)
					return { output: `access_${accessId}` }
				})
			}

			const runtime = new FlowRuntime({})
			const result = await runtime.run(
				flow.toBlueprint(),
				{ nextId: 0 },
				{
					functionRegistry: flow.getFunctionRegistry(),
					concurrency: 10, // High concurrency to test race conditions
				},
			)

			expect(result.status).toBe('completed')
			expect(maxConcurrentAccesses).toBeLessThanOrEqual(10) // Should respect concurrency limit
			expect(result.context.nextId).toBe(accessCount) // All accesses should be accounted for
		})

		it('should handle concurrent node failures gracefully', async () => {
			const flow = createFlow('concurrent-failures')
			const nodeCount = 10

			// Mix of succeeding and failing nodes
			for (let i = 0; i < nodeCount; i++) {
				flow.node(`node${i}`, async () => {
					if (i % 3 === 0) {
						// Every third node fails
						throw new Error(`Node ${i} failed`)
					}
					await new Promise((resolve) => setTimeout(resolve, Math.random() * 20))
					return { output: `success_${i}` }
				})
			}

			const runtime = new FlowRuntime({})
			const result = await runtime.run(
				flow.toBlueprint(),
				{},
				{
					functionRegistry: flow.getFunctionRegistry(),
					concurrency: 5,
				},
			)

			expect(result.status).toBe('failed') // Should fail due to some nodes failing
			expect(result.errors).toBeDefined()
			expect(result.errors?.length).toBeGreaterThan(0)

			// Check that successful nodes still produced outputs
			for (let i = 0; i < nodeCount; i++) {
				if (i % 3 !== 0) {
					expect(result.context[`_outputs.node${i}`]).toBe(`success_${i}`)
				}
			}
		})

		it('should maintain execution order invariants despite concurrency', async () => {
			const flow = createFlow('order-invariants')
			const executionLog: string[] = []

			// Create a chain where order matters
			flow.node('start', async () => {
				executionLog.push('start')
				return { output: 'start' }
			})

			flow.node('middle1', async () => {
				executionLog.push('middle1')
				return { output: 'middle1' }
			})

			flow.node('middle2', async () => {
				executionLog.push('middle2')
				return { output: 'middle2' }
			})

			flow.node('end', async ({ context }) => {
				executionLog.push('end')
				const inputs = await Promise.all([
					context.get('_outputs.start'),
					context.get('_outputs.middle1'),
					context.get('_outputs.middle2'),
				])
				return { output: `end_with_${inputs.join('_')}` }
			})

			// Create edges that allow parallel execution but require proper sequencing
			flow.edge('start', 'middle1')
			flow.edge('start', 'middle2')
			flow.edge('middle1', 'end')
			flow.edge('middle2', 'end')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(
				flow.toBlueprint(),
				{},
				{
					functionRegistry: flow.getFunctionRegistry(),
					concurrency: 3,
				},
			)

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.end']).toBe('end_with_start_middle1_middle2')
			// Start should always be first
			expect(executionLog[0]).toBe('start')
			// End should always be last
			expect(executionLog[executionLog.length - 1]).toBe('end')
		})
	})
})

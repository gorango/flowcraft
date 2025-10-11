import type { IEventBus, Middleware } from '../src/types'
import { describe, expect, it, vi } from 'vitest'
import { FatalNodeExecutionError } from '../src/errors'
import { createFlow } from '../src/flow'
import { BaseNode } from '../src/node'
import { FlowRuntime } from '../src/runtime'

// A mock event bus for testing observability
class MockEventBus implements IEventBus {
	events: { eventName: string, payload: Record<string, any> }[] = []

	emit(eventName: string, payload: Record<string, any>) {
		this.events.push({ eventName, payload })
	}

	has(eventName: string) {
		return this.events.some(e => e.eventName === eventName)
	}
}

describe('Flowcraft Runtime', () => {
	describe('Core Execution', () => {
		it('should execute a simple linear blueprint', async () => {
			const flow = createFlow('linear')
			flow.node('A', async () => ({ output: 'resultA' }))
				.node('B', async ctx => ({ output: `${ctx.input}_B` }))
				.edge('A', 'B')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context.B).toBe('resultA_B')
		})

		it('should correctly traverse a DAG with fan-out and fan-in', async () => {
			const flow = createFlow('fan')
			flow.node('A', async () => ({ output: 'A' }))
				.node('B', async () => ({ output: 'B' }))
				.node('C', async () => ({ output: 'C' }))
				.node('D', async ctx => ({ output: `input was ${String(ctx.input)}` }))
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
			flow.node('A', async () => ({ output: 'A' }))
				.node('B', async () => { throw new Error('Fail') })
				.node('C', async () => ({ output: 'C' }))
				.node('D', async () => ({ output: 'D' }))
				.edge('A', 'D')
				.edge('B', 'D')
				.edge('C', 'D')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('failed')
			expect(result.errors).toBeDefined()
			expect(result.errors?.some(e => e.nodeId === 'B')).toBe(true)
			expect(result.context.D).toBeUndefined()
		})

		it('should handle a blueprint with multiple start nodes', async () => {
			const flow = createFlow('multi')
			flow.node('A', async () => ({ output: 'A' }))
				.node('B', async () => ({ output: 'B' }))
				.node('C', async ctx => ({ output: `input was ${String(ctx.input)}` }))
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
			flow.node('A', async () => ({ output: 'A' }))
				.node('B', async () => ({ output: 'B' }))
				.edge('A', 'B')
				.edge('B', 'A')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { strict: false, functionRegistry: flow.getFunctionRegistry() })

			// The runtime's `completedNodes` check prevents infinite loops.
			expect(result.status).toBe('completed')
		})

		it('should throw an error on a graph with a cycle when strict mode is on', async () => {
			const flow = createFlow('cycle')
			flow.node('A', async () => ({ output: 'A' }))
				.node('B', async () => ({ output: 'B' }))
				.edge('A', 'B')
				.edge('B', 'A')

			const runtime = new FlowRuntime({})
			const promise = runtime.run(flow.toBlueprint(), {}, { strict: true, functionRegistry: flow.getFunctionRegistry() })

			await expect(promise).rejects.toThrow(/Cycles are not allowed/)
		})
	})

	describe('State Management & Data Flow', () => {
		it('should automatically save a node\'s output to the context using its ID', async () => {
			const flow = createFlow('save').node('A', async () => ({ output: 'test' }))
			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.A).toBe('test')
		})

		it('should correctly resolve a simple string `inputs` mapping', async () => {
			const flow = createFlow('input')
			flow.node('A', async () => ({ output: 'data' }))
				.node('B', async ctx => ({ output: `${ctx.input}_B` }), { inputs: 'A' })
				.edge('A', 'B')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.B).toBe('data_B')
		})

		it('should correctly resolve a complex object `inputs` mapping', async () => {
			const flow = createFlow('complex')
			flow.node('A', async () => ({ output: { key: 'value' } }))
				.node('B', async ctx => ({ output: `${ctx.input.data.key}_B` }), { inputs: { data: 'A' } })
				.edge('A', 'B')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.B).toBe('value_B')
		})

		it('should use the single-predecessor output as `input` if no mapping is provided', async () => {
			const flow = createFlow('single')
			flow.node('A', async () => ({ output: 'data' }))
				.node('B', async ctx => ({ output: `${ctx.input}_B` }))
				.edge('A', 'B')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.B).toBe('data_B')
		})

		it('should apply an edge `transform` expression to the data flow', async () => {
			const flow = createFlow('transform')
			flow.node('A', async () => ({ output: 10 }))
				.node('B', async ctx => ({ output: ctx.input }))
				.edge('A', 'B', { transform: 'input * 2' })

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.B).toBe(20)
		})

		it('should handle "undefined" as a valid node output and save it to the context', async () => {
			const flow = createFlow('undefined').node('A', async () => ({ output: undefined }))
			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context).toHaveProperty('A')
			expect(result.context.A).toBeUndefined()
		})

		it('should not have input for a node with multiple predecessors and no explicit "inputs" mapping', async () => {
			const flow = createFlow('multi-no-input')
			flow.node('A', async () => ({ output: 'A' }))
				.node('B', async () => ({ output: 'B' }))
				.node('C', async ctx => ({ output: ctx.input === undefined ? 'no-input' : 'had-input' }))
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
			flow.node('A', async () => ({ output: 'A', action: 'success' }))
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
			flow.node('A', async () => ({ output: { status: 'OK' } }))
				.node('B', async () => ({ output: 'B' }))
				.node('C', async () => ({ output: 'C' }))
				.edge('A', 'B', { condition: 'result.output.status === \'OK\'' })
				.edge('A', 'C', { condition: 'result.output.status === \'ERROR\'' })

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.B).toBe('B')
			expect(result.context.C).toBeUndefined()
		})

		it('should not follow a conditional edge if the condition is false', async () => {
			const flow = createFlow('condition-false')
			flow.node('A', async () => ({ output: 'A' }))
				.node('B', async () => ({ output: 'B' }))
				.node('C', async () => ({ output: 'C' }))
				.edge('A', 'B', { condition: '1 === 2' }) // false
				.edge('A', 'C')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.B).toBeUndefined()
			expect(result.context.C).toBe('C')
		})

		it('should follow the default (unconditional) edge if no other paths match', async () => {
			const flow = createFlow('default')
			flow.node('A', async () => ({ output: 'A', action: 'unknown' }))
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

	describe('Resilience (`executeNode`)', () => {
		it('should retry a failing NodeFunction the specified number of times', async () => {
			let attempts = 0
			const flow = createFlow('retry-fn')
			flow.node('A', async () => {
				attempts++
				if (attempts < 3)
					throw new Error('Fail')
				return { output: 'success' }
			}, { config: { maxRetries: 3 } })

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context.A).toBe('success')
			expect(attempts).toBe(3)
		})

		it('should retry only the `exec` phase of a failing BaseNode', async () => {
			let prepCalls = 0
			let execAttempts = 0
			let postCalls = 0

			class RetryNode extends BaseNode {
				async prep() {
					prepCalls++
					return null
				}

				async exec() {
					execAttempts++
					if (execAttempts < 3)
						throw new Error('Fail')
					return { output: 'success' }
				}

				async post() {
					postCalls++
					return { output: 'success' }
				}
			}

			const flow = createFlow('retry-class').node('A', RetryNode, { config: { maxRetries: 3 } })
			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(prepCalls).toBe(1)
			expect(execAttempts).toBe(3)
			expect(postCalls).toBe(1)
		})

		it('should call the fallback implementation if all retries are exhausted', async () => {
			const flow = createFlow('fallback')
			flow.node('A', async () => {
				throw new Error('Fail')
			}, { config: { maxRetries: 2, fallback: 'FallbackNode' } })
				.node('FallbackNode', async () => ({ output: 'fallback success' }))
				.edge('A', 'B') // This edge should not be taken
				.node('B', async () => ({ output: 'B' }))

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context.A).toBe('fallback success')
			expect(result.context.B).toBeUndefined()
		})

		it('should fail the workflow if retries fail and no fallback is provided', async () => {
			let attempts = 0
			const flow = createFlow('error')
			flow.node('A', async () => {
				attempts++
				throw new Error('Fail')
			}, { config: { maxRetries: 2 } })

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('failed')
			expect(attempts).toBe(2)
			expect(result.errors).toBeDefined()
			expect(result.errors?.[0].nodeId).toBe('A')
		})

		it('should immediately fail and bypass retries on FatalNodeExecutionError', async () => {
			let attempts = 0
			const flow = createFlow('fatal')
			flow.node('A', async () => {
				attempts++
				throw new FatalNodeExecutionError('Fatal', 'A', 'fatal')
			}, { config: { maxRetries: 5, fallback: 'B' } })
				.node('B', async () => ({ output: 'fallback' }))

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('failed')
			expect(attempts).toBe(1) // No retries
			expect(result.context.B).toBeUndefined() // Fallback skipped
		})
	})

	describe('High-Level Pattern Execution', () => {
		// Note: The current runtime's built-in `batch-gather` node is only a synchronization point.
		// It does not automatically aggregate results. This test verifies the pattern runs to completion.
		it('should execute the batch pattern and all dynamic workers to completion', async () => {
			const flow = createFlow('batch')
			flow.node('start', async () => ({ output: ['item1', 'item2', 'item3'] }))
				.batch('process-items', async ctx => ({ output: `${ctx.input}_processed` }), {
					inputKey: 'start',
					outputKey: 'results', // Note: `outputKey` is not used by the built-in gather node
				})
				.edge('start', 'process-items_scatter')
				.node('final', async () => ({ output: 'done' }))
				.edge('process-items_gather', 'final')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context.final).toBe('done')
			// We can't easily check for dynamic node outputs without knowing their generated IDs,
			// but we can confirm the final node ran, proving the gather node worked as a join point.
		})

		it('should correctly execute a loop until the condition is false', async () => {
			const flow = createFlow('loop')
			// Set initial value
			flow.node('A', async () => ({ output: 0 }))
				// Loop Body Start: Increment the value
				.node('B', async ctx => ({ output: (ctx.input as number) + 1 }))
				// Loop Body End: Copy value for condition check
				.node('C', async ctx => ({ output: ctx.input }))
				// Connect initial value to loop start
				.edge('A', 'B')
				// Connect loop body nodes
				.edge('B', 'C')
				// Define the loop construct
				.loop('my-loop', {
					startNodeId: 'B',
					endNodeId: 'C',
					condition: 'C < 3', // Note: The runtime implicitly uses `context.C`
				})
				// After the loop breaks, continue to a final node
				.node('D', async () => ({ output: 'finished' }))
				.edge('my-loop_loop_controller', 'D', { action: 'break' })

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			// The loop runs for values 1, 2, 3. It breaks when C becomes 3.
			expect(result.context.C).toBe(3)
			expect(result.context.D).toBe('finished')
		})
	})

	describe('Extensibility & Observability', () => {
		it('should wrap execution with `aroundNode` middleware in the correct LIFO order', async () => {
			const order: string[] = []
			const middleware: Middleware[] = [
				{
					aroundNode: async (ctx, nodeId, next) => {
						order.push('before1')
						const result = await next()
						order.push('after1')
						return result
					},
				},
				{
					aroundNode: async (ctx, nodeId, next) => {
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
			const middleware: Middleware[] = [{
				aroundNode: async () => ({ output: 'short-circuit' }),
			}]
			const flow = createFlow('mw-short').node('A', async () => ({ output: 'should-not-run' }))
			const runtime = new FlowRuntime({ middleware })
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.context.A).toBe('short-circuit')
		})

		it('should call `beforeNode` and `afterNode` middleware for each node', async () => {
			const beforeSpy = vi.fn()
			const afterSpy = vi.fn()
			const middleware: Middleware[] = [{ beforeNode: beforeSpy, afterNode: afterSpy }]

			const flow = createFlow('mw-before-after').node('A', async () => ({ output: 'A' }))
			const runtime = new FlowRuntime({ middleware })
			await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(beforeSpy).toHaveBeenCalledOnce()
			expect(afterSpy).toHaveBeenCalledOnce()
		})

		it('should call `afterNode` even if the node fails', async () => {
			const afterSpy = vi.fn()
			const middleware: Middleware[] = [{ afterNode: afterSpy }]
			const flow = createFlow('mw-after-fail').node('A', async () => { throw new Error('Fail') })
			const runtime = new FlowRuntime({ middleware })
			await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(afterSpy).toHaveBeenCalledOnce()
		})

		it('should emit `workflow:start` and `workflow:finish` events', async () => {
			const eventBus = new MockEventBus()
			const flow = createFlow('events-workflow').node('A', async () => ({ output: 'A' }))
			const runtime = new FlowRuntime({ eventBus })
			await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(eventBus.has('workflow:start')).toBe(true)
			expect(eventBus.has('workflow:finish')).toBe(true)
		})

		it('should emit `node:start`, `node:finish`, `node:retry`, and `node:error` events', async () => {
			const eventBus = new MockEventBus()
			let attempts = 0
			const flow = createFlow('events-node')
			flow.node('A', async () => {
				attempts++
				if (attempts < 2)
					throw new Error('Retry me')
				return { output: 'A' }
			}, { config: { maxRetries: 2 } })
				.node('B', async () => { throw new Error('Fail me') })

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

			expect(capturedDeps).toBe(deps)
		})
	})

	describe('Cancellation', () => {
		it('should result in a cancelled status if the signal is aborted mid-flight', async () => {
			const controller = new AbortController()
			const flow = createFlow('cancel-me')
			flow.node('A', async () => {
				controller.abort() // Abort after the first node starts
				return { output: 'A' }
			})
				.node('B', async () => new Promise(resolve => setTimeout(() => resolve({ output: 'B' }), 50)))
				.edge('A', 'B')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { signal: controller.signal, functionRegistry: flow.getFunctionRegistry() })

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
			await runtime.run(flow.toBlueprint(), {}, { signal: controller.signal, functionRegistry: flow.getFunctionRegistry() })

			expect(signalReceived).toBe(controller.signal)
		})
	})
})

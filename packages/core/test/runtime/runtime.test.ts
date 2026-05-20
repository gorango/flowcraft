import { describe, expect, it, vi } from 'vitest'
import { createFlow } from '../../src/flow'
import { FlowRuntime } from '../../src/runtime/runtime'
import { WorkflowState } from '../../src/runtime/state'
import { UnsafeEvaluator } from '../../src/evaluator'
import type { FlowcraftEvent, IEventBus } from '../../src/types'

class MockEventBus implements IEventBus {
	events: FlowcraftEvent[] = []
	async emit(event: FlowcraftEvent) {
		this.events.push(event)
	}
}

describe('FlowRuntime - Resume', () => {
	it('should resume a workflow from awaiting state', async () => {
		const flow = createFlow('resume-test')
			.node('start', async ({ context }) => {
				await context.set('step', 'started')
				return { output: 'started' }
			})
			.node('wait', async ({ context, dependencies }) => {
				await context.set('step', 'waiting')
				await dependencies.workflowState.markAsAwaiting('wait')
				return { output: 'waiting' }
			})
			.node('finish', async ({ context }) => {
				await context.set('step', 'finished')
				return { output: 'finished' }
			})
			.edge('start', 'wait')
			.edge('wait', 'finish')

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime()

		const result1 = await runtime.run(
			blueprint,
			{},
			{ functionRegistry: flow.getFunctionRegistry() },
		)
		expect(result1.status).toBe('awaiting')

		const result2 = await runtime.resume(
			blueprint,
			result1.serializedContext,
			{ output: 'resumed' },
			'wait',
			{ functionRegistry: flow.getFunctionRegistry() },
		)

		expect(result2.status).toBe('completed')
		expect(result2.context.step).toBe('finished')
	})

	it('should throw when resuming non-awaiting context', async () => {
		const flow = createFlow('resume-no-await').node('a', async () => ({ output: 'done' }))

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime()

		const result = await runtime.run(
			blueprint,
			{},
			{ functionRegistry: flow.getFunctionRegistry() },
		)
		expect(result.status).toBe('completed')

		await expect(
			runtime.resume(blueprint, result.serializedContext, { output: 'x' }),
		).rejects.toThrow('Cannot resume')
	})

	it('should throw when resuming with invalid node ID', async () => {
		const flow = createFlow('resume-invalid-node').node('a', async ({ dependencies }) => {
			await dependencies.workflowState.markAsAwaiting('a')
			return { output: 'waiting' }
		})

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime()

		const result = await runtime.run(
			blueprint,
			{},
			{ functionRegistry: flow.getFunctionRegistry() },
		)
		expect(result.status).toBe('awaiting')

		await expect(
			runtime.resume(blueprint, result.serializedContext, { output: 'x' }, 'nonexistent'),
		).rejects.toThrow('not in an awaiting state')
	})
})

describe('FlowRuntime - executeNode', () => {
	it('should execute a single node and return result', async () => {
		const flow = createFlow('exec-node').node('A', async () => ({ output: 'hello' }))

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime()
		const state = new WorkflowState({})

		const result = await runtime.executeNode(
			blueprint,
			'A',
			state,
			undefined,
			flow.getFunctionRegistry(),
			'test-exec',
		)

		expect(result.output).toBe('hello')
	})

	it('should throw when node not found in blueprint', async () => {
		const flow = createFlow('exec-node-missing').node('A', async () => ({ output: 'hello' }))

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime()
		const state = new WorkflowState({})

		await expect(
			runtime.executeNode(blueprint, 'missing', state, undefined, flow.getFunctionRegistry()),
		).rejects.toThrow("Node 'missing' not found")
	})

	it('should throw when executor fails', async () => {
		const flow = createFlow('exec-node-fail').node('A', async () => ({ output: 'hello' }))

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime()
		const state = new WorkflowState({})

		const mockExecutor = {
			execute: vi.fn().mockRejectedValue(new Error('Execution failed')),
		}
		vi.spyOn((runtime as any).executorFactory, 'createExecutorForNode').mockReturnValue(
			mockExecutor,
		)

		await expect(
			runtime.executeNode(blueprint, 'A', state, undefined, flow.getFunctionRegistry()),
		).rejects.toThrow('Execution failed')
	})

	it('should execute fallback when main node fails with failed_with_fallback status', async () => {
		const flow = createFlow('exec-node-fallback')
			.node(
				'A',
				async () => {
					throw new Error('Main failed')
				},
				{ config: { fallback: 'B' } },
			)
			.node('B', async () => ({ output: 'fallback' }))

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime()
		const state = new WorkflowState({})

		const result = await runtime.executeNode(
			blueprint,
			'A',
			state,
			undefined,
			flow.getFunctionRegistry(),
			'test-exec',
		)

		expect(result.output).toBe('fallback')
		expect((result as any)._fallbackExecuted).toBe(true)
	})

	it('should throw when fallback node not found in blueprint', async () => {
		const flow = createFlow('exec-node-fallback-missing').node(
			'A',
			async () => {
				throw new Error('Main failed')
			},
			{ config: { fallback: 'missing' } },
		)

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime()
		const state = new WorkflowState({})

		await expect(
			runtime.executeNode(blueprint, 'A', state, undefined, flow.getFunctionRegistry()),
		).rejects.toThrow("Fallback node 'missing' not found")
	})

	it('should throw when fallback execution also fails', async () => {
		const flow = createFlow('exec-node-fallback-fail')
			.node(
				'A',
				async () => {
					throw new Error('Main failed')
				},
				{ config: { fallback: 'B' } },
			)
			.node('B', async () => {
				throw new Error('Fallback also failed')
			})

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime()
		const state = new WorkflowState({})

		await expect(
			runtime.executeNode(blueprint, 'A', state, undefined, flow.getFunctionRegistry()),
		).rejects.toThrow('execution failed')
	})
})

describe('FlowRuntime - Scheduler', () => {
	it('should start and stop scheduler', async () => {
		const runtime = new FlowRuntime()
		runtime.startScheduler(100)
		runtime.stopScheduler()
	})

	it('should create new scheduler with custom interval', async () => {
		const runtime = new FlowRuntime()
		runtime.startScheduler(50)
		expect(runtime.scheduler).toBeDefined()
		runtime.stopScheduler()
	})
})

describe('FlowRuntime - Constructor variants', () => {
	it('should work with no options', () => {
		const runtime = new FlowRuntime()
		expect(runtime.logger).toBeDefined()
		expect(runtime.registry.size).toBeGreaterThan(0)
	})

	it('should work with partial options', () => {
		const eventBus = new MockEventBus()
		const runtime = new FlowRuntime({ eventBus })
		expect(runtime.eventBus).toBe(eventBus)
	})

	it('should register built-in nodes', () => {
		const runtime = new FlowRuntime()
		expect(runtime.registry.has('wait')).toBe(true)
		expect(runtime.registry.has('sleep')).toBe(true)
		expect(runtime.registry.has('webhook')).toBe(true)
		expect(runtime.registry.has('subflow')).toBe(true)
		expect(runtime.registry.has('batch-scatter')).toBe(true)
		expect(runtime.registry.has('batch-gather')).toBe(true)
		expect(runtime.registry.has('loop-controller')).toBe(true)
	})

	it('should merge user registry with built-in nodes', () => {
		const customNode = vi.fn().mockResolvedValue({ output: 'custom' })
		const runtime = new FlowRuntime({ registry: { custom: customNode } })
		expect(runtime.registry.has('custom')).toBe(true)
		expect(runtime.registry.has('wait')).toBe(true)
	})
})

describe('FlowRuntime - getBlueprint', () => {
	it('should return undefined for unknown blueprint', () => {
		const runtime = new FlowRuntime()
		expect(runtime.getBlueprint('unknown')).toBeUndefined()
	})

	it('should return registered blueprint', () => {
		const bp = { id: 'test', nodes: [], edges: [] }
		const runtime = new FlowRuntime({ blueprints: { test: bp } })
		expect(runtime.getBlueprint('test')).toBe(bp)
	})
})

describe('FlowRuntime - determineNextNodes', () => {
	it('should determine next nodes from a completed node', async () => {
		const flow = createFlow('next-nodes')
			.node('A', async () => ({ output: 'a' }))
			.node('B', async () => ({ output: 'b' }))
			.edge('A', 'B')

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime()
		const state = new WorkflowState({})
		const context = state.getContext()

		const next = await runtime.determineNextNodes(
			blueprint,
			'A',
			{ output: 'a' },
			context,
			'test-exec',
		)

		expect(next).toHaveLength(1)
		expect(next[0].node.id).toBe('B')
	})
})

describe('FlowRuntime - replay edge cases', () => {
	it('should throw when executionId cannot be determined', async () => {
		const flow = createFlow('replay-no-exec').node('A', async () => ({ output: 'a' }))

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime()

		await expect(runtime.replay(blueprint, [])).rejects.toThrow('Cannot determine execution ID')
	})

	it('should replay with filtered events', async () => {
		const eventBus = new MockEventBus()
		const runtime = new FlowRuntime({ eventBus })

		const flow = createFlow('replay-filtered').node('A', async () => ({ output: 'a' }))

		const blueprint = flow.toBlueprint()
		const result = await runtime.run(
			blueprint,
			{},
			{ functionRegistry: flow.getFunctionRegistry() },
		)
		const executionId = result.context._executionId as string

		const replayResult = await runtime.replay(blueprint, eventBus.events, executionId)
		expect(replayResult.status).toBe('completed')
	})
})

describe('FlowRuntime - executeNodes', () => {
	it('should reconstruct context from context:change events', async () => {
		const flow = createFlow('exec-nodes-basic').node('A', async ({ context }) => {
			await context.set('value', 42)
			return { output: 'done' }
		})

		const blueprint = flow.toBlueprint()
		const runtime = new FlowRuntime()

		const events: FlowcraftEvent[] = [
			{
				type: 'context:change',
				payload: { sourceNode: 'A', key: 'value', op: 'set', value: 42 },
			},
		]

		const result = await runtime.executeNodes(blueprint, 'test-exec', [], events, {
			functionRegistry: flow.getFunctionRegistry(),
		})

		expect(result.context.value).toBe(42)
	})

	it('should execute a single node and store output', async () => {
		const eventBus = new MockEventBus()
		const runtime = new FlowRuntime({ eventBus })

		const flow = createFlow('exec-nodes-single').node('A', async () => ({
			output: 'a-output',
		}))

		const blueprint = flow.toBlueprint()
		const events: FlowcraftEvent[] = []

		const result = await runtime.executeNodes(blueprint, 'test-exec', ['A'], events, {
			functionRegistry: flow.getFunctionRegistry(),
		})

		expect(result.context.A).toBe('a-output')
		expect(result.context['_outputs.A']).toBe('a-output')
	})

	it('should apply edge transforms during execution', async () => {
		const evaluator = new UnsafeEvaluator()
		const runtime = new FlowRuntime({ evaluator })

		const flow = createFlow('exec-nodes-transform')
			.node('A', async () => ({ output: 100 }))
			.node('B', async ({ params }) => ({ output: params.result }))
			.edge('A', 'B', { transform: 'input * 2' })

		const blueprint = flow.toBlueprint()

		const result = await runtime.executeNodes(blueprint, 'test-exec', ['A', 'B'], [], {
			functionRegistry: flow.getFunctionRegistry(),
		})

		expect(result.context['_inputs.B']).toBe(200)
	})

	it('should throw when executing non-existent node', async () => {
		const runtime = new FlowRuntime()

		const flow = createFlow('exec-nodes-missing').node('A', async () => ({ output: 'a' }))

		const blueprint = flow.toBlueprint()

		await expect(runtime.executeNodes(blueprint, 'test-exec', ['missing'], [])).rejects.toThrow(
			"Node 'missing' not found",
		)
	})

	it('should handle inputOverrides for specific nodes', async () => {
		const runtime = new FlowRuntime()

		const flow = createFlow('exec-nodes-override').node('A', async ({ context }) => ({
			output: await context.get('customInput' as any),
		}))

		const blueprint = flow.toBlueprint()

		const result = await runtime.executeNodes(blueprint, 'test-exec', ['A'], [], {
			functionRegistry: flow.getFunctionRegistry(),
			inputOverrides: {
				A: { customInput: 'override-value' },
			},
		})

		expect(result.context.A).toBe('override-value')
	})

	it('should emit node:start and node:finish events', async () => {
		const eventBus = new MockEventBus()
		const runtime = new FlowRuntime({ eventBus })

		const flow = createFlow('exec-nodes-events').node('A', async () => ({ output: 'a' }))

		const blueprint = flow.toBlueprint()

		await runtime.executeNodes(blueprint, 'test-exec', ['A'], [], {
			functionRegistry: flow.getFunctionRegistry(),
		})

		const nodeStart = eventBus.events.find((e) => e.type === 'node:start')
		const nodeFinish = eventBus.events.find((e) => e.type === 'node:finish')

		expect(nodeStart).toBeDefined()
		expect(nodeStart?.payload.nodeId).toBe('A')
		expect(nodeFinish).toBeDefined()
		expect(nodeFinish?.payload.nodeId).toBe('A')
	})

	it('should handle node errors and emit node:error event', async () => {
		const eventBus = new MockEventBus()
		const runtime = new FlowRuntime({ eventBus })

		const flow = createFlow('exec-nodes-error').node('A', async () => {
			throw new Error('Node failed')
		})

		const blueprint = flow.toBlueprint()

		await expect(
			runtime.executeNodes(blueprint, 'test-exec', ['A'], [], {
				functionRegistry: flow.getFunctionRegistry(),
			}),
		).rejects.toThrow()

		const nodeError = eventBus.events.find((e) => e.type === 'node:error')
		expect(nodeError).toBeDefined()
		expect(nodeError?.payload.nodeId).toBe('A')
		expect(nodeError?.payload.error.message).toContain('execution failed')
	})

	it('should handle context:change with delete operation', async () => {
		const runtime = new FlowRuntime()

		const flow = createFlow('exec-nodes-delete').node('A', async ({ context }) => {
			await context.set('temp', 'value')
			await context.delete('temp')
			return { output: 'done' }
		})

		const blueprint = flow.toBlueprint()

		const events: FlowcraftEvent[] = [
			{
				type: 'context:change',
				payload: { sourceNode: 'A', key: 'temp', op: 'set', value: 'value' },
			},
			{ type: 'context:change', payload: { sourceNode: 'A', key: 'temp', op: 'delete' } },
		]

		const result = await runtime.executeNodes(blueprint, 'test-exec', ['A'], events, {
			functionRegistry: flow.getFunctionRegistry(),
		})

		expect(result.context.temp).toBeUndefined()
	})

	it('should execute multiple nodes in sequence', async () => {
		const runtime = new FlowRuntime()

		const flow = createFlow('exec-nodes-chain')
			.node('A', async () => ({ output: 10 }))
			.node('B', async () => ({ output: 20 }))
			.edge('A', 'B')

		const blueprint = flow.toBlueprint()

		const result = await runtime.executeNodes(blueprint, 'test-exec', ['A', 'B'], [], {
			functionRegistry: flow.getFunctionRegistry(),
		})

		expect(result.context.A).toBe(10)
		expect(result.context.B).toBe(20)
	})
})

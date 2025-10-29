import { describe, expect, it, vi } from 'vitest'
import { UnsafeEvaluator } from '../../src/evaluator'
import { ExecutionContext } from '../../src/runtime/execution-context'
import { FlowRuntime } from '../../src/runtime/runtime'
import { WorkflowState } from '../../src/runtime/state'

describe('FlowRuntime', () => {
	it('should initialize with options', () => {
		const runtime = new FlowRuntime({})
		expect(runtime.options).toEqual({})
	})

	it('should execute individual nodes', async () => {
		const blueprint = {
			id: 'node',
			nodes: [{ id: 'A', uses: 'test', params: {} }],
			edges: [],
		}
		const state = new WorkflowState({})
		const runtime = new FlowRuntime({})
		const mockExecutor = {
			execute: vi.fn().mockResolvedValue({
				status: 'success',
				result: { output: 'result' },
			}),
		}

		vi.spyOn((runtime as any).executorFactory, 'createExecutorForNode').mockReturnValue(mockExecutor)
		const result = await runtime.executeNode(blueprint, 'A', state)
		expect(result.output).toBe('result')
	})

	it('should handle executeNode errors', async () => {
		const blueprint = {
			id: 'node-error',
			nodes: [{ id: 'A', uses: 'test', params: {} }],
			edges: [],
		}
		const state = new WorkflowState({})
		const runtime = new FlowRuntime({})
		const mockExecutor = {
			execute: vi.fn().mockRejectedValue(new Error('Execution failed')),
		}

		vi.spyOn((runtime as any).executorFactory, 'createExecutorForNode').mockReturnValue(mockExecutor)
		await expect(runtime.executeNode(blueprint, 'A', state)).rejects.toThrow('Execution failed')
	})

	it('should determine next nodes correctly', async () => {
		const blueprint = {
			id: 'next',
			nodes: [
				{ id: 'A', uses: 'test', params: {} },
				{ id: 'B', uses: 'test', params: {} },
			],
			edges: [{ source: 'A', target: 'B' }],
		}
		const runtime = new FlowRuntime({})
		const result = { output: 'test' }
		const context = { type: 'sync', toJSON: vi.fn().mockReturnValue({}) } as any
		const nextNodes = await runtime.determineNextNodes(blueprint, 'A', result, context)
		expect(nextNodes).toHaveLength(1)
		expect(nextNodes[0].node.id).toBe('B')
	})

	it('should apply edge transforms', async () => {
		const runtime = new FlowRuntime({ evaluator: new UnsafeEvaluator() })
		const edge = { source: 'A', target: 'B', transform: 'input * 2' }
		const sourceResult = { output: 5 }
		const targetNode = { id: 'B', uses: 'test', params: {} }
		const context = {
			type: 'sync',
			set: vi.fn(),
			toJSON: vi.fn().mockReturnValue({}),
		} as any
		await runtime.applyEdgeTransform(edge, sourceResult, targetNode, context)
		expect(context.set).toHaveBeenCalledWith('_inputs.B', 10)
	})

	it('should respect abort signals', async () => {
		const controller = new AbortController()
		controller.abort()
		const blueprint = { id: 'cancel', nodes: [], edges: [] }
		const runtime = new FlowRuntime({})
		const result = await runtime.run(blueprint, {}, { signal: controller.signal })
		expect(result.status).toBe('cancelled')
	})

	describe('Scheduler Integration', () => {
		it('should start and stop scheduler', () => {
			const runtime = new FlowRuntime({})
			runtime.startScheduler()
			expect(runtime.scheduler).toBeDefined()
			runtime.stopScheduler()
		})

		it('should register awaiting workflow with timer', async () => {
			const runtime = new FlowRuntime({
				blueprints: {
					'sleep-workflow': {
						id: 'sleep-workflow',
						nodes: [
							{ id: 'start', uses: 'test', params: {} },
							{ id: 'sleep', uses: 'sleep', params: { duration: 100 } },
						],
						edges: [{ source: 'start', target: 'sleep' }],
					},
				},
			})

			const mockNode = vi.fn().mockResolvedValue({ output: 'done' })
			runtime.registry.set('test', mockNode)

			const blueprint = runtime.getBlueprint('sleep-workflow')
			if (!blueprint) throw new Error('Blueprint not found')
			const result = await runtime.run(blueprint)
			expect(result.status).toBe('awaiting')

			// Check that scheduler registered the workflow
			const active = runtime.scheduler.getActiveWorkflows()
			expect(active.length).toBe(1)
			expect(active[0].blueprintId).toBe('sleep-workflow')
			expect(active[0].awaitingNodeId).toBe('sleep')
		})

		it('should resume expired timer workflow', async () => {
			const runtime = new FlowRuntime({
				blueprints: {
					'sleep-workflow': {
						id: 'sleep-workflow',
						nodes: [
							{ id: 'start', uses: 'test', params: {} },
							{ id: 'sleep', uses: 'sleep', params: { duration: 1 } }, // 1ms
							{ id: 'end', uses: 'test', params: {} },
						],
						edges: [
							{ source: 'start', target: 'sleep' },
							{ source: 'sleep', target: 'end' },
						],
					},
				},
			})

			const mockNode = vi.fn().mockResolvedValue({ output: 'done' })
			runtime.registry.set('test', mockNode)

			// Run workflow, it should await
			const blueprint = runtime.getBlueprint('sleep-workflow')
			if (!blueprint) throw new Error('Blueprint not found')
			const result1 = await runtime.run(blueprint)
			expect(result1.status).toBe('awaiting')

			// Start scheduler with shorter interval for testing
			runtime.startScheduler(100) // Check every 100ms

			// Wait for scheduler to check (should check within 200ms)
			await new Promise((resolve) => setTimeout(resolve, 200))

			// The workflow should have resumed and completed
			const active = runtime.scheduler.getActiveWorkflows()
			expect(active.length).toBe(0) // Should be completed

			runtime.stopScheduler()
		})

		it('should create execution context for subflow', () => {
			const runtime = new FlowRuntime({})
			const subBlueprint = { id: 'sub', nodes: [], edges: [] }
			const context = runtime.createForSubflow(subBlueprint, { initial: 'data' }, 'exec-123')
			expect(context).toBeInstanceOf(ExecutionContext)
			expect(context.executionId).toBe('exec-123')
			expect(context.blueprint.id).toBe('sub')
		})
	})
})

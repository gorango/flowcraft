import { describe, expect, it, vi } from 'vitest'
import { WorkflowState } from '../../src/runtime/state'
import { GraphTraverser } from '../../src/runtime/traverser'

describe('GraphTraverser', () => {
	it('should initialize with blueprint and state', () => {
		const blueprint = { id: 'test', nodes: [], edges: [] }
		const state = new WorkflowState({})
		const runtime = {} as any
		const traverser = new GraphTraverser(blueprint, runtime, state, undefined, 'exec1')
		expect(traverser.getAllNodeIds()).toEqual(new Set())
	})

	it('should traverse simple linear workflow', async () => {
		const blueprint = {
			id: 'linear',
			nodes: [
				{ id: 'A', uses: 'test', params: {} },
				{ id: 'B', uses: 'test', params: {} },
			],
			edges: [{ source: 'A', target: 'B' }],
		}
		const state = new WorkflowState({})
		const runtime = {
			executeNode: vi.fn().mockResolvedValue({ output: 'result' }),
			determineNextNodes: vi.fn().mockResolvedValue([]),
			applyEdgeTransform: vi.fn(),
		} as any
		const traverser = new GraphTraverser(blueprint, runtime, state, undefined, 'exec1')
		await traverser.traverse()
		expect(runtime.executeNode).toHaveBeenCalledWith(
			blueprint,
			'A',
			state,
			expect.any(Map),
			undefined,
			'exec1',
			undefined,
		)
		expect(runtime.executeNode).toHaveBeenCalledWith(
			blueprint,
			'B',
			state,
			expect.any(Map),
			undefined,
			'exec1',
			undefined,
		)
	})

	it('should handle parallel branches', async () => {
		const blueprint = {
			id: 'parallel',
			nodes: [
				{ id: 'A', uses: 'test', params: {} },
				{ id: 'B', uses: 'test', params: {} },
				{ id: 'C', uses: 'test', params: {} },
			],
			edges: [
				{ source: 'A', target: 'B' },
				{ source: 'A', target: 'C' },
			],
		}
		const state = new WorkflowState({})
		const runtime = {
			executeNode: vi.fn().mockResolvedValue({ output: 'result' }),
			determineNextNodes: vi.fn().mockResolvedValue([]),
			applyEdgeTransform: vi.fn(),
		} as any
		const traverser = new GraphTraverser(blueprint, runtime, state, undefined, 'exec1')
		await traverser.traverse()
		expect(runtime.executeNode).toHaveBeenCalledTimes(3)
	})

	it('should handle cycles if not strict', async () => {
		const blueprint = {
			id: 'cycle',
			nodes: [
				{ id: 'A', uses: 'test', params: {} },
				{ id: 'B', uses: 'test', params: {} },
			],
			edges: [
				{ source: 'A', target: 'B' },
				{ source: 'B', target: 'A' },
			],
		}
		const state = new WorkflowState({})
		const runtime = {
			options: { strict: false },
			executeNode: vi.fn().mockResolvedValue({ output: 'result' }),
			determineNextNodes: vi.fn().mockResolvedValue([]),
			applyEdgeTransform: vi.fn(),
		} as any
		const traverser = new GraphTraverser(blueprint, runtime, state, undefined, 'exec1')
		await traverser.traverse()
		// Should complete without infinite loop due to completed nodes check
		expect(state.getCompletedNodes().size).toBeGreaterThan(0)
	})

	it('should handle dynamic nodes', async () => {
		const blueprint = {
			id: 'dynamic',
			nodes: [{ id: 'A', uses: 'test', params: {} }],
			edges: [],
		}
		const state = new WorkflowState({})
		const runtime = {
			executeNode: vi.fn().mockImplementation((_blueprint, nodeId) => {
				if (nodeId === 'A') {
					return Promise.resolve({
						output: 'result',
						dynamicNodes: [{ id: 'D1', uses: 'test', params: {} }],
					})
				}
				return Promise.resolve({ output: 'result' })
			}),
			determineNextNodes: vi.fn().mockResolvedValue([]),
			applyEdgeTransform: vi.fn(),
		} as any
		const traverser = new GraphTraverser(blueprint, runtime, state, undefined, 'exec1')
		await traverser.traverse()
		expect(traverser.getDynamicBlueprint().nodes).toHaveLength(2)
	})

	it('should respect abort signals', async () => {
		const controller = new AbortController()
		controller.abort()
		const blueprint = {
			id: 'abort',
			nodes: [{ id: 'A', uses: 'test', params: {} }],
			edges: [],
		}
		const state = new WorkflowState({})
		const runtime = {
			executeNode: vi.fn().mockResolvedValue({ output: 'result' }),
			determineNextNodes: vi.fn().mockResolvedValue([]),
			applyEdgeTransform: vi.fn(),
		} as any
		const traverser = new GraphTraverser(blueprint, runtime, state, undefined, 'exec1', controller.signal)
		await expect(traverser.traverse()).rejects.toThrow('Workflow cancelled')
	})

	it('should return correct node IDs', () => {
		const blueprint = {
			id: 'test',
			nodes: [
				{ id: 'A', uses: 'test', params: {} },
				{ id: 'B', uses: 'test', params: {} },
			],
			edges: [],
		}
		const state = new WorkflowState({})
		const runtime = {} as any
		const traverser = new GraphTraverser(blueprint, runtime, state, undefined, 'exec1')
		expect(traverser.getAllNodeIds()).toEqual(new Set(['A', 'B']))
	})

	it('should identify fallback nodes', () => {
		const blueprint = {
			id: 'fallback',
			nodes: [
				{ id: 'A', uses: 'test', params: {}, config: { fallback: 'F' } },
				{ id: 'F', uses: 'test', params: {} },
			],
			edges: [],
		}
		const state = new WorkflowState({})
		const runtime = {} as any
		const traverser = new GraphTraverser(blueprint, runtime, state, undefined, 'exec1')
		expect(traverser.getFallbackNodeIds()).toEqual(new Set(['F']))
	})

	it('should handle simple nested loops', async () => {
		// Outer loop: start_outer -> body_outer -> end_outer -> controller_outer -> start_outer (continue) or exit
		// Inner loop inside body_outer: start_inner -> body_inner -> end_inner -> controller_inner -> start_inner (continue) or back to body_outer
		const blueprint = {
			id: 'nested-loops',
			nodes: [
				{ id: 'start_outer', uses: 'test', params: {} },
				{ id: 'body_outer', uses: 'test', params: {} },
				{ id: 'start_inner', uses: 'test', params: {} },
				{ id: 'body_inner', uses: 'test', params: {} },
				{ id: 'end_inner', uses: 'test', params: {} },
				{ id: 'end_outer', uses: 'test', params: {} },
				{ id: 'controller_outer', uses: 'loop-controller', params: { condition: 'outer < 2' } },
				{ id: 'controller_inner', uses: 'loop-controller', params: { condition: 'inner < 2' } },
			],
			edges: [
				{ source: 'start_outer', target: 'body_outer' },
				{ source: 'body_outer', target: 'start_inner' },
				{ source: 'start_inner', target: 'body_inner' },
				{ source: 'body_inner', target: 'end_inner' },
				{ source: 'end_inner', target: 'controller_inner' },
				{ source: 'controller_inner', target: 'start_inner', action: 'continue' },
				{ source: 'controller_inner', target: 'end_outer', action: 'break' },
				{ source: 'end_outer', target: 'controller_outer' },
				{ source: 'controller_outer', target: 'start_outer', action: 'continue' },
				{ source: 'controller_outer', target: 'exit', action: 'break' },
			],
		}
		const state = new WorkflowState({ outer: 0, inner: 0 })
		let outerCount = 0
		let innerCount = 0
		const runtime = {
			options: { strict: false },
			executeNode: vi.fn().mockImplementation((_blueprint, nodeId, _state) => {
				if (nodeId === 'controller_outer') {
					outerCount++
					return Promise.resolve({ action: outerCount < 2 ? 'continue' : 'break' })
				}
				if (nodeId === 'controller_inner') {
					innerCount++
					return Promise.resolve({ action: innerCount % 2 === 1 ? 'continue' : 'break' })
				}
				return Promise.resolve({ output: 'result' })
			}),
			determineNextNodes: vi.fn().mockResolvedValue([]),
			applyEdgeTransform: vi.fn(),
		} as any
		const traverser = new GraphTraverser(blueprint, runtime, state, undefined, 'exec1')
		await traverser.traverse()
		expect(runtime.executeNode).toHaveBeenCalledWith(
			expect.anything(),
			'start_outer',
			expect.anything(),
			expect.anything(),
			undefined,
			'exec1',
			undefined,
		)
		expect(runtime.executeNode).toHaveBeenCalledWith(
			expect.anything(),
			'controller_outer',
			expect.anything(),
			expect.anything(),
			undefined,
			'exec1',
			undefined,
		)
		// Verify no infinite loop or deadlock
		expect(state.getCompletedNodes().size).toBeGreaterThan(0)
	})

	it('should handle loop with external entry point', async () => {
		// External node -> node inside loop body
		const blueprint = {
			id: 'external-entry',
			nodes: [
				{ id: 'external', uses: 'test', params: {} },
				{ id: 'start', uses: 'test', params: {} },
				{ id: 'body', uses: 'test', params: {}, config: { joinStrategy: 'any' as const } },
				{ id: 'end', uses: 'test', params: {} },
				{ id: 'controller', uses: 'loop-controller', params: { condition: 'i < 2' } },
			],
			edges: [
				{ source: 'start', target: 'body' },
				{ source: 'body', target: 'end' },
				{ source: 'end', target: 'controller' },
				{ source: 'controller', target: 'start', action: 'continue' },
				{ source: 'controller', target: 'exit', action: 'break' },
				{ source: 'external', target: 'body' }, // External entry to inside loop
			],
		}
		const state = new WorkflowState({ i: 0 })
		let controllerCalls = 0
		const runtime = {
			options: { strict: false },
			executeNode: vi.fn().mockImplementation((_blueprint, nodeId) => {
				if (nodeId === 'controller') {
					controllerCalls++
					return Promise.resolve({ action: controllerCalls < 2 ? 'continue' : 'break' })
				}
				return Promise.resolve({ output: 'result' })
			}),
			determineNextNodes: vi.fn().mockResolvedValue([]),
			applyEdgeTransform: vi.fn(),
		} as any
		const traverser = new GraphTraverser(blueprint, runtime, state, undefined, 'exec1')
		await traverser.traverse()
		// Check that both external and controller are called
		expect(runtime.executeNode).toHaveBeenCalledWith(
			expect.anything(),
			'external',
			expect.anything(),
			expect.anything(),
			undefined,
			'exec1',
			undefined,
		)
		expect(runtime.executeNode).toHaveBeenCalledWith(
			expect.anything(),
			'controller',
			expect.anything(),
			expect.anything(),
			undefined,
			'exec1',
			undefined,
		)
		// Verify correct execution without issues
		expect(state.getCompletedNodes().size).toBeGreaterThan(0)
	})

	it('should handle loop with multiple conditional exit points', async () => {
		// Loop with multiple ways to exit based on conditions
		const blueprint = {
			id: 'multiple-exits',
			nodes: [
				{ id: 'start', uses: 'test', params: {} },
				{ id: 'check1', uses: 'test', params: {} },
				{ id: 'check2', uses: 'test', params: {} },
				{ id: 'body', uses: 'test', params: {} },
				{ id: 'controller', uses: 'loop-controller', params: { condition: 'i < 3' } },
			],
			edges: [
				{ source: 'start', target: 'check1' },
				{ source: 'check1', target: 'exit1', action: 'break' }, // Early exit condition
				{ source: 'check1', target: 'body' },
				{ source: 'body', target: 'check2' },
				{ source: 'check2', target: 'exit2', action: 'break' }, // Another exit condition
				{ source: 'check2', target: 'controller' },
				{ source: 'controller', target: 'start', action: 'continue' },
				{ source: 'controller', target: 'final_exit', action: 'break' },
			],
		}
		const state = new WorkflowState({ i: 0 })
		let controllerCalls = 0
		const runtime = {
			options: { strict: false },
			executeNode: vi.fn().mockImplementation((_blueprint, nodeId) => {
				if (nodeId === 'controller') {
					controllerCalls++
					return Promise.resolve({ action: controllerCalls < 2 ? 'continue' : 'break' })
				}
				if (nodeId === 'check1' && controllerCalls > 0) {
					return Promise.resolve({ output: 'exit' }) // Trigger early exit on second iteration
				}
				return Promise.resolve({ output: 'result' })
			}),
			determineNextNodes: vi.fn().mockResolvedValue([]),
			applyEdgeTransform: vi.fn(),
		} as any
		const traverser = new GraphTraverser(blueprint, runtime, state, undefined, 'exec1')
		await traverser.traverse()
		expect(runtime.executeNode).toHaveBeenCalledWith(
			expect.anything(),
			'controller',
			expect.anything(),
			expect.anything(),
			undefined,
			'exec1',
			undefined,
		)
		// Verify multiple exit paths are handled
		expect(state.getCompletedNodes().size).toBeGreaterThan(0)
	})
})

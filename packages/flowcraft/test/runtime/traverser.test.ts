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
		expect(runtime.executeNode).toHaveBeenCalledWith(blueprint, 'A', state, expect.any(Map), undefined, 'exec1', undefined)
		expect(runtime.executeNode).toHaveBeenCalledWith(blueprint, 'B', state, expect.any(Map), undefined, 'exec1', undefined)
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
			executeNode: vi.fn().mockImplementation((blueprint, nodeId) => {
				if (nodeId === 'A') {
					return Promise.resolve({ output: 'result', dynamicNodes: [{ id: 'D1', uses: 'test', params: {} }] })
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
		const blueprint = { id: 'abort', nodes: [{ id: 'A', uses: 'test', params: {} }], edges: [] }
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
})

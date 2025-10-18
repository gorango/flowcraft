import { describe, expect, it } from 'vitest'
import { GraphTraverser } from '../../src/runtime/traverser'

describe('GraphTraverser', () => {
	it('should initialize with blueprint and state', () => {
		const blueprint = { id: 'test', nodes: [], edges: [] }
		const traverser = new GraphTraverser(blueprint, false)
		expect(traverser.getAllNodeIds()).toEqual(new Set())
	})

	it('should identify start nodes in simple linear workflow', () => {
		const blueprint = {
			id: 'linear',
			nodes: [
				{ id: 'A', uses: 'test', params: {} },
				{ id: 'B', uses: 'test', params: {} },
			],
			edges: [{ source: 'A', target: 'B' }],
		}
		const traverser = new GraphTraverser(blueprint, false)
		const readyNodes = traverser.getReadyNodes()
		expect(readyNodes).toHaveLength(1)
		expect(readyNodes[0].nodeId).toBe('A')
		expect(traverser.hasMoreWork()).toBe(false)
	})

	it('should identify start nodes in parallel branches', () => {
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
		const traverser = new GraphTraverser(blueprint, false)
		const readyNodes = traverser.getReadyNodes()
		expect(readyNodes).toHaveLength(1)
		expect(readyNodes[0].nodeId).toBe('A')
	})

	it('should handle cycles if not strict', () => {
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
		const traverser = new GraphTraverser(blueprint, false)
		const readyNodes = traverser.getReadyNodes()
		expect(readyNodes).toHaveLength(1)
		expect(readyNodes[0].nodeId).toBe('A')
	})

	it('should mark node as completed and add next nodes to frontier', () => {
		const blueprint = {
			id: 'linear',
			nodes: [
				{ id: 'A', uses: 'test', params: {} },
				{ id: 'B', uses: 'test', params: {} },
			],
			edges: [{ source: 'A', target: 'B' }],
		}
		const traverser = new GraphTraverser(blueprint, false)
		traverser.getReadyNodes()

		const bNode = blueprint.nodes.find((n) => n.id === 'B')
		if (!bNode) throw new Error('Node B not found')
		traverser.markNodeCompleted('A', { output: 'result' }, [bNode])

		expect(traverser.hasMoreWork()).toBe(true)
		const nextReady = traverser.getReadyNodes()
		expect(nextReady).toHaveLength(1)
		expect(nextReady[0].nodeId).toBe('B')
	})

	it('should not return node twice', () => {
		const blueprint = {
			id: 'linear',
			nodes: [
				{ id: 'A', uses: 'test', params: {} },
				{ id: 'B', uses: 'test', params: {} },
			],
			edges: [{ source: 'A', target: 'B' }],
		}
		const traverser = new GraphTraverser(blueprint, false)
		traverser.getReadyNodes()

		const bNode = blueprint.nodes.find((n) => n.id === 'B')
		if (!bNode) throw new Error('Node B not found')
		traverser.markNodeCompleted('A', { output: 'result' }, [bNode])
		traverser.getReadyNodes()

		traverser.markNodeCompleted('B', { output: 'result' }, [bNode])
		expect(traverser.hasMoreWork()).toBe(false)
	})

	it('should return correct node IDs', () => {
		const blueprint = {
			id: 'test',
			nodes: [
				{ id: 'A', uses: 'test', params: {} },
				{ id: 'B', uses: 'test', params: {} },
			],
			edges: [{ source: 'A', target: 'B' }],
		}
		const traverser = new GraphTraverser(blueprint, false)
		expect(traverser.getAllNodeIds()).toEqual(new Set(['A', 'B']))
	})

	it('should identify fallback nodes', () => {
		const blueprint = {
			id: 'test',
			nodes: [
				{ id: 'A', uses: 'test', params: {}, config: { fallback: 'B' } },
				{ id: 'B', uses: 'test', params: {} },
			],
			edges: [],
		}
		const traverser = new GraphTraverser(blueprint, false)
		expect(traverser.getFallbackNodeIds()).toEqual(new Set(['B']))
	})

	it('should handle join strategy "any"', () => {
		const blueprint = {
			id: 'test',
			nodes: [
				{ id: 'A', uses: 'test', params: {} },
				{ id: 'B', uses: 'test', params: {} },
				{ id: 'C', uses: 'test', params: {}, config: { joinStrategy: 'any' as const } },
			],
			edges: [
				{ source: 'A', target: 'C' },
				{ source: 'B', target: 'C' },
			],
		}
		const traverser = new GraphTraverser(blueprint, false)
		const readyNodes = traverser.getReadyNodes()
		expect(readyNodes).toHaveLength(2)

		const cNode = blueprint.nodes.find((n) => n.id === 'C')
		if (!cNode) throw new Error('Node C not found')
		traverser.markNodeCompleted('A', { output: 'result' }, [cNode])

		expect(traverser.hasMoreWork()).toBe(true)
		const nextReady = traverser.getReadyNodes()
		expect(nextReady.some((n) => n.nodeId === 'C')).toBe(true)
	})

	it('should handle join strategy "all"', () => {
		const blueprint = {
			id: 'test',
			nodes: [
				{ id: 'A', uses: 'test', params: {} },
				{ id: 'B', uses: 'test', params: {} },
				{ id: 'C', uses: 'test', params: {}, config: { joinStrategy: 'all' as const } },
			],
			edges: [
				{ source: 'A', target: 'C' },
				{ source: 'B', target: 'C' },
			],
		}
		const traverser = new GraphTraverser(blueprint, false)
		const readyNodes = traverser.getReadyNodes()
		expect(readyNodes).toHaveLength(2)

		const cNode = blueprint.nodes.find((n) => n.id === 'C')
		if (!cNode) throw new Error('Node C not found')
		traverser.markNodeCompleted('A', { output: 'result' }, [cNode])

		let nextReady = traverser.getReadyNodes()
		expect(nextReady.some((n) => n.nodeId === 'C')).toBe(false)

		traverser.markNodeCompleted('B', { output: 'result' }, [cNode])
		nextReady = traverser.getReadyNodes()
		expect(nextReady.some((n) => n.nodeId === 'C')).toBe(true)
	})

	it('should handle dynamic nodes from batch-scatter', () => {
		const blueprint = {
			id: 'test',
			nodes: [{ id: 'scatter', uses: 'batch-scatter', params: {} }],
			edges: [],
		}
		const traverser = new GraphTraverser(blueprint, false)
		traverser.getReadyNodes()

		traverser.markNodeCompleted(
			'scatter',
			{
				output: { gatherNodeId: 'gather', hasMore: false },
				dynamicNodes: [
					{ id: 'worker1', uses: 'worker', params: {} },
					{ id: 'worker2', uses: 'worker', params: {} },
				],
			},
			[],
		)

		expect(traverser.hasMoreWork()).toBe(true)
		const nextReady = traverser.getReadyNodes()
		expect(nextReady).toHaveLength(2)
		expect(nextReady.some((n) => n.nodeId === 'worker1')).toBe(true)
		expect(nextReady.some((n) => n.nodeId === 'worker2')).toBe(true)
	})
})

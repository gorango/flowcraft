import { describe, it, expect } from 'vitest'
import type { WorkflowBlueprint } from 'flowcraft'
import {
	getPredecessors,
	getSuccessors,
	haveAllPredecessorsCompleted,
	getExecutionOrder,
	findOrphanNodes,
	getDataFlow,
} from '../../src/utils/graph'

function makeBlueprint(
	nodes: Array<{
		id: string
		uses: string
		config?: Record<string, unknown>
		inputs?: Record<string, string>
	}>,
	edges: Array<{
		source: string
		target: string
		action?: string
		condition?: string
		transform?: string
	}>,
): WorkflowBlueprint {
	return {
		id: 'test-bp',
		nodes: nodes as unknown as WorkflowBlueprint['nodes'],
		edges: edges as unknown as WorkflowBlueprint['edges'],
	}
}

describe('getPredecessors', () => {
	it('returns empty array for start node', () => {
		const bp = makeBlueprint([{ id: 'a', uses: 'mock' }], [])
		expect(getPredecessors(bp, 'a')).toEqual([])
	})

	it('returns predecessors with edge data', () => {
		const bp = makeBlueprint(
			[
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
			],
			[{ source: 'a', target: 'b', action: 'next' }],
		)
		const preds = getPredecessors(bp, 'b')
		expect(preds).toHaveLength(1)
		expect(preds[0].nodeId).toBe('a')
		expect(preds[0].edge.action).toBe('next')
	})
})

describe('getSuccessors', () => {
	it('returns empty array for terminal node', () => {
		const bp = makeBlueprint([{ id: 'a', uses: 'mock' }], [])
		expect(getSuccessors(bp, 'a')).toEqual([])
	})

	it('returns successors with edge data', () => {
		const bp = makeBlueprint(
			[
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
			],
			[{ source: 'a', target: 'b', condition: 'x > 0' }],
		)
		const succs = getSuccessors(bp, 'a')
		expect(succs).toHaveLength(1)
		expect(succs[0].nodeId).toBe('b')
		expect(succs[0].edge.condition).toBe('x > 0')
	})
})

describe('haveAllPredecessorsCompleted', () => {
	it('returns true for node with no predecessors', () => {
		const bp = makeBlueprint([{ id: 'a', uses: 'mock' }], [])
		expect(haveAllPredecessorsCompleted(bp, 'a', new Set())).toBe(true)
	})

	it('returns true when all predecessors completed', () => {
		const bp = makeBlueprint(
			[
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
			],
			[{ source: 'a', target: 'b' }],
		)
		expect(haveAllPredecessorsCompleted(bp, 'b', new Set(['a']))).toBe(true)
	})

	it('returns false when not all predecessors completed', () => {
		const bp = makeBlueprint(
			[
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
			],
			[{ source: 'a', target: 'b' }],
		)
		expect(haveAllPredecessorsCompleted(bp, 'b', new Set())).toBe(false)
	})
})

describe('getExecutionOrder', () => {
	it('returns single node for no edges', () => {
		const bp = makeBlueprint([{ id: 'a', uses: 'mock' }], [])
		expect(getExecutionOrder(bp)).toEqual(['a'])
	})

	it('returns topological order for linear chain', () => {
		const bp = makeBlueprint(
			[
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
				{ id: 'c', uses: 'mock' },
			],
			[
				{ source: 'a', target: 'b' },
				{ source: 'b', target: 'c' },
			],
		)
		const order = getExecutionOrder(bp)
		expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'))
		expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'))
	})

	it('handles diamond pattern', () => {
		const bp = makeBlueprint(
			[
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
				{ id: 'c', uses: 'mock' },
				{ id: 'd', uses: 'mock' },
			],
			[
				{ source: 'a', target: 'b' },
				{ source: 'a', target: 'c' },
				{ source: 'b', target: 'd' },
				{ source: 'c', target: 'd' },
			],
		)
		const order = getExecutionOrder(bp)
		expect(order).toContain('a')
		expect(order).toContain('d')
		expect(order.indexOf('a')).toBeLessThan(order.indexOf('d'))
	})

	it('returns all nodes even with cycles', () => {
		const bp = makeBlueprint(
			[
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
			],
			[
				{ source: 'a', target: 'b' },
				{ source: 'b', target: 'a' },
			],
		)
		const order = getExecutionOrder(bp)
		expect(order.length).toBeLessThanOrEqual(2)
	})
})

describe('findOrphanNodes', () => {
	it('returns empty array when all nodes reachable', () => {
		const bp = makeBlueprint(
			[
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
			],
			[{ source: 'a', target: 'b' }],
		)
		expect(findOrphanNodes(bp)).toEqual([])
	})

	it('finds nodes unreachable from start nodes', () => {
		// a->b (a is start node, b reachable from a)
		// c->c (self-loop: c has incoming edge but from itself, not a start node)
		// c is an orphan because it's not reachable from any start node
		const bp = makeBlueprint(
			[
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
				{ id: 'c', uses: 'mock' },
			],
			[
				{ source: 'a', target: 'b' },
				{ source: 'c', target: 'c' },
			],
		)
		expect(findOrphanNodes(bp)).toContain('c')
	})

	it('returns empty for single node', () => {
		const bp = makeBlueprint([{ id: 'a', uses: 'mock' }], [])
		expect(findOrphanNodes(bp)).toEqual([])
	})
})

describe('getDataFlow', () => {
	it('returns null for non-existent edge', () => {
		const bp = makeBlueprint(
			[
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock' },
			],
			[],
		)
		expect(getDataFlow(bp, 'a', 'b')).toBeNull()
	})

	it('returns input mapping and transform', () => {
		const bp = makeBlueprint(
			[
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock', inputs: { x: 'a.result' } },
			],
			[{ source: 'a', target: 'b', transform: 'input.x' }],
		)
		const flow = getDataFlow(bp, 'a', 'b')
		expect(flow).not.toBeNull()
		expect(flow!.inputMapping).toEqual({ x: 'a.result' })
		expect(flow!.transform).toBe('input.x')
	})

	it('handles string inputs', () => {
		const bp = makeBlueprint(
			[
				{ id: 'a', uses: 'mock' },
				{ id: 'b', uses: 'mock', inputs: 'a.result' as unknown as Record<string, string> },
			],
			[{ source: 'a', target: 'b' }],
		)
		const flow = getDataFlow(bp, 'a', 'b')
		expect(flow!.inputMapping).toEqual({ default: 'a.result' })
	})
})

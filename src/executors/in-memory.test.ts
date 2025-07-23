import { describe, expect, it } from 'vitest'
import { contextKey, Flow, Node, TypedContext } from '../workflow'
import { InMemoryExecutor } from './in-memory'

const VALUE = contextKey<number>('value')
const PATH = contextKey<string[]>('path')

class AddNode extends Node {
	constructor(private num: number) { super() }
	async exec({ ctx }: any) {
		const current = ctx.get(VALUE) ?? 0
		ctx.set(VALUE, current + this.num)
		const path = ctx.get(PATH) ?? []
		ctx.set(PATH, [...path, `add-${this.num}`])
	}
}

class BranchNode extends Node {
	async post({ ctx }: any) {
		return ctx.get(VALUE) > 10 ? 'over' : 'under'
	}
}

describe('testInMemoryExecutor', () => {
	it('should execute a simple linear flow', async () => {
		const ctx = new TypedContext([[VALUE, 1]])
		const startNode = new AddNode(5)
		startNode.next(new AddNode(3))
		const flow = new Flow(startNode)
		const executor = new InMemoryExecutor()
		await executor.run(flow, ctx)
		expect(ctx.get(VALUE)).toBe(9)
		expect(ctx.get(PATH)).toEqual(['add-5', 'add-3'])
	})

	it('should handle conditional branching', async () => {
		const ctx = new TypedContext([[VALUE, 5]])
		const start = new AddNode(6) // 11
		const branch = new BranchNode()
		const overNode = new AddNode(100)
		const underNode = new AddNode(-1)
		start.next(branch)
		branch.next(overNode, 'over')
		branch.next(underNode, 'under')
		const flow = new Flow(start)
		const executor = new InMemoryExecutor()
		await executor.run(flow, ctx)
		expect(ctx.get(VALUE)).toBe(111) // 5 + 6 + 100
		expect(ctx.get(PATH)).toEqual(['add-6', 'add-100'])
	})

	it('should work when passed via flow.run options', async () => {
		const ctx = new TypedContext([[VALUE, 1]])
		const flow = new Flow(new AddNode(5))
		await flow.run(ctx, { executor: new InMemoryExecutor() })
		expect(ctx.get(VALUE)).toBe(6)
	})
})

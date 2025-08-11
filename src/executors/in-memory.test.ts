import type { MiddlewareNext, NodeArgs } from '../types'
import { describe, expect, it } from 'vitest'
import { contextKey, TypedContext } from '../context'
import { Flow, Node } from '../workflow/index'
import { InMemoryExecutor } from './in-memory'

const VALUE = contextKey<number>('value')
const PATH = contextKey<string[]>('path')
const MIDDLEWARE_PATH = contextKey<string[]>('middleware_path')

// Helper Nodes for testing
class AddNode extends Node {
	constructor(private num: number, public id: string) { super() }
	async exec({ ctx }: any) {
		const current = await ctx.get(VALUE) ?? 0
		ctx.set(VALUE, current + this.num)
		const path = await ctx.get(PATH) ?? []
		ctx.set(PATH, [...path, this.id])
	}
}

class BranchNode extends Node {
	async post({ ctx }: any) {
		const path = await ctx.get(PATH) ?? []
		ctx.set(PATH, [...path, 'branch'])
		return await ctx.get(VALUE) > 10 ? 'over' : 'under'
	}
}

describe('testInMemoryExecutor', () => {
	it('should execute a simple linear flow', async () => {
		const ctx = new TypedContext([[VALUE, 1]])
		const startNode = new AddNode(5, 'start')
		startNode.next(new AddNode(3, 'next'))
		const flow = new Flow(startNode)
		const executor = new InMemoryExecutor()

		await executor.run(flow, ctx)

		expect(await ctx.get(VALUE)).toBe(9)
		expect(await ctx.get(PATH)).toEqual(['start', 'next'])
	})

	it('should handle conditional branching', async () => {
		const ctx = new TypedContext([[VALUE, 5]])
		const start = new AddNode(6, 'start') // value becomes 11
		const branch = new BranchNode()
		const overNode = new AddNode(100, 'over_node')
		const underNode = new AddNode(-1, 'under_node')
		start.next(branch)
		branch.next(overNode, 'over')
		branch.next(underNode, 'under')

		const flow = new Flow(start)
		const executor = new InMemoryExecutor()

		await executor.run(flow, ctx)

		expect(await ctx.get(VALUE)).toBe(111) // 5 + 6 + 100
		expect(await ctx.get(PATH)).toEqual(['start', 'branch', 'over_node'])
	})

	it('should correctly execute a composed flow (sub-flow)', async () => {
		const ctx = new TypedContext([[VALUE, 1]])
		const innerStart = new AddNode(5, 'inner_start') // 1 + 5 = 6
		innerStart.next(new AddNode(10, 'inner_end')) // 6 + 10 = 16
		const innerFlow = new Flow(innerStart)
		const outerStart = new AddNode(100, 'outer_start') // 16 + 100 = 116
		const outerFlow = new Flow(innerFlow)
		innerFlow.next(outerStart)
		const executor = new InMemoryExecutor()
		await executor.run(outerFlow, ctx)
		expect(await ctx.get(VALUE)).toBe(116)
		expect(await ctx.get(PATH)).toEqual(['inner_start', 'inner_end', 'outer_start'])
	})

	it('should apply middleware from the orchestrating flow to its nodes', async () => {
		const ctx = new TypedContext()
		const flow = new Flow(new AddNode(10, 'node1'))
		const testMiddleware = async (args: NodeArgs, next: MiddlewareNext) => {
			const path = await args.ctx.get(MIDDLEWARE_PATH) ?? []
			args.ctx.set(MIDDLEWARE_PATH, [...path, `enter_${args.name}`])
			const result = await next(args)
			const finalPath = await args.ctx.get(MIDDLEWARE_PATH) ?? []
			args.ctx.set(MIDDLEWARE_PATH, [...finalPath, `exit_${args.name}`])
			return result
		}
		flow.use(testMiddleware)
		const executor = new InMemoryExecutor()
		await executor.run(flow, ctx)
		expect(await ctx.get(VALUE)).toBe(10)
		expect(await ctx.get(MIDDLEWARE_PATH)).toEqual(['enter_AddNode', 'exit_AddNode'])
	})
})

import type { NodeArgs } from './workflow.js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
	DEFAULT_ACTION,
	Flow,
	Node,
} from './workflow.js'

// Silence console.warn during tests
let warnSpy: ReturnType<typeof vi.spyOn>
beforeAll(() => {
	warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
})
afterAll(() => {
	warnSpy.mockRestore()
})

class NumberNode extends Node {
	constructor(private number: number) { super() }
	async prep({ ctx }: NodeArgs) {
		ctx.set('current', this.number)
	}
}
class AddNode extends Node {
	constructor(private number: number) { super() }
	async prep({ ctx }: NodeArgs) {
		ctx.set('current', ctx.get('current') + this.number)
	}
}
class MultiplyNode extends Node {
	constructor(private number: number) { super() }
	async prep({ ctx }: NodeArgs) {
		ctx.set('current', ctx.get('current') * this.number)
	}
}
class CheckPositiveNode extends Node<void, void, string> {
	async post({ ctx }: NodeArgs): Promise<string> {
		return ctx.get('current') >= 0 ? 'positive' : 'negative'
	}
}
class SignalNode extends Node<void, void, string> {
	constructor(private signal = 'finished') { super() }
	async post(): Promise<string> {
		return this.signal
	}
}
class PathNode extends Node {
	constructor(private pathId: string) { super() }
	async prep({ ctx }: NodeArgs) {
		ctx.set('path_taken', this.pathId)
	}
}

describe('testFlowBasic', () => {
	it('should handle a simple linear pipeline', async () => {
		const ctx = new Map()
		const n1 = new NumberNode(5)
		const n2 = new AddNode(3)
		const n3 = new MultiplyNode(2)
		const flow = new Flow()
		flow.start(n1).next(n2).next(n3)
		const lastAction = await flow.run(ctx)
		expect(ctx.get('current')).toBe(16)
		expect(lastAction).toBe(DEFAULT_ACTION)
	})
	it('should handle positive branching', async () => {
		const ctx = new Map()
		const startNode = new NumberNode(5)
		const checkNode = new CheckPositiveNode()
		const addIfPositive = new AddNode(10)
		const addIfNegative = new AddNode(-20)
		const flow = new Flow(startNode)
		startNode.next(checkNode)
		checkNode.next(addIfPositive, 'positive')
		checkNode.next(addIfNegative, 'negative')
		await flow.run(ctx)
		expect(ctx.get('current')).toBe(15)
	})
	it('should handle negative branching', async () => {
		const ctx = new Map()
		const startNode = new NumberNode(-5)
		const checkNode = new CheckPositiveNode()
		const addIfPositive = new AddNode(10)
		const addIfNegative = new AddNode(-20)
		const flow = new Flow(startNode)
		startNode.next(checkNode)
		checkNode.next(addIfPositive, 'positive')
		checkNode.next(addIfNegative, 'negative')
		await flow.run(ctx)
		expect(ctx.get('current')).toBe(-25)
	})
	it('should return the final action from the last node in a cycle', async () => {
		const ctx = new Map()
		const startNode = new NumberNode(10)
		const checkNode = new CheckPositiveNode()
		const subtractNode = new AddNode(-3)
		const endNode = new SignalNode('cycle_done')
		const flow = new Flow(startNode)
		startNode.next(checkNode)
		checkNode.next(subtractNode, 'positive')
		checkNode.next(endNode, 'negative')
		subtractNode.next(checkNode)
		const lastAction = await flow.run(ctx)
		expect(ctx.get('current')).toBe(-2)
		expect(lastAction).toBe('cycle_done')
	})
})

describe('testFlowComposition', () => {
	it('should treat a flow as a node in another flow', async () => {
		const ctx = new Map()
		const innerFlow = new Flow(new NumberNode(5))
		innerFlow.startNode!.next(new AddNode(10)).next(new MultiplyNode(2))
		const outerFlow = new Flow(innerFlow)
		await outerFlow.run(ctx)
		expect(ctx.get('current')).toBe(30)
	})
	it('should propagate actions from inner flows for branching', async () => {
		const ctx = new Map()
		const innerStart = new NumberNode(100)
		const innerEnd = new SignalNode('inner_done')
		innerStart.next(innerEnd)
		const innerFlow = new Flow(innerStart)
		const pathA = new PathNode('A')
		const pathB = new PathNode('B')
		const outerFlow = new Flow(innerFlow)
		innerFlow.next(pathA, 'other_action')
		innerFlow.next(pathB, 'inner_done')
		await outerFlow.run(ctx)
		expect(ctx.get('current')).toBe(100)
		expect(ctx.get('path_taken')).toBe('B')
	})
})

describe('testExecFallback', () => {
	class FallbackNode extends Node<void, string> {
		public attemptCount = 0
		constructor(private shouldFail: boolean, maxRetries: number) { super(maxRetries) }
		async exec(): Promise<string> {
			this.attemptCount++
			if (this.shouldFail)
				throw new Error('Intentional failure')
			return 'success'
		}

		async execFallback(): Promise<string> { return 'fallback' }
		async post({ ctx, execRes }: NodeArgs<void, string>) {
			ctx.set('result', execRes)
			ctx.set('attempts', this.attemptCount)
		}
	}
	it('should call execFallback after all retries are exhausted', async () => {
		const ctx = new Map()
		const node = new FallbackNode(true, 3)
		await node.run(ctx)
		expect(ctx.get('attempts')).toBe(3)
		expect(ctx.get('result')).toBe('fallback')
	})
})

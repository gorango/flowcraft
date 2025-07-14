import type { NodeArgs } from './workflow.js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
	BatchFlow,
	DEFAULT_ACTION,
	Flow,
	Node,
	ParallelBatchFlow,
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

describe('testBatchProcessing', () => {
	it('should process items sequentially using BatchFlow', async () => {
		const ctx = new Map([['input_data', { a: 1, b: 2, c: 3 }]])
		class DataProcessNode extends Node {
			async prep({ ctx, params }: NodeArgs) {
				const key = params.key
				const data = ctx.get('input_data')[key]
				if (!ctx.has('results'))
					ctx.set('results', {})
				ctx.get('results')[key] = data * 2
			}
		}
		class SimpleBatchFlow extends BatchFlow {
			async prep() { return [{ key: 'a' }, { key: 'b' }, { key: 'c' }] }
		}
		const flow = new SimpleBatchFlow(new DataProcessNode())
		await flow.run(ctx)
		expect(ctx.get('results')).toEqual({ a: 2, b: 4, c: 6 })
	})

	it('should run a BatchFlow sequentially and respect async delays', async () => {
		const ctx = new Map([['results', []]])
		class DelayedNode extends Node {
			async exec({ params }: NodeArgs) {
				await new Promise(res => setTimeout(res, 15))
				return params.val
			}

			async post({ ctx, execRes }: NodeArgs) {
				ctx.get('results').push(execRes)
			}
		}
		class TestBatchFlow extends BatchFlow {
			async prep() { return [{ val: 1 }, { val: 2 }, { val: 3 }] }
		}
		const flow = new TestBatchFlow(new DelayedNode())
		const startTime = Date.now()
		await flow.run(ctx)
		const duration = Date.now() - startTime
		expect(ctx.get('results')).toEqual([1, 2, 3])
		// 3 tasks of 15ms should take at least 45ms.
		expect(duration).toBeGreaterThanOrEqual(45)
	})
})

describe('testParallelProcessing', () => {
	it('should run a ParallelBatchFlow in parallel', async () => {
		const ctx = new Map([
			['input_data', { a: 1, b: 2, c: 3 }],
			['results', {}],
		])
		class DataProcessNode extends Node<void, number> {
			async exec({ ctx, params }: NodeArgs<void, void>): Promise<number> {
				await new Promise(res => setTimeout(res, 15))
				const data = ctx.get('input_data')[params.key]
				return data * params.multiplier
			}

			async post({ ctx, execRes, params }: NodeArgs<void, number>) {
				if (!ctx.has('results'))
					ctx.set('results', {})
				ctx.get('results')[params.key] = execRes
			}
		}
		class TestParallelBatchFlow extends ParallelBatchFlow {
			async prep() {
				return [
					{ key: 'a', multiplier: 2 },
					{ key: 'b', multiplier: 3 },
					{ key: 'c', multiplier: 4 },
				]
			}
		}
		const flow = new TestParallelBatchFlow(new DataProcessNode())
		const startTime = Date.now()
		await flow.run(ctx)
		const duration = Date.now() - startTime
		expect(ctx.get('results')).toEqual({ a: 2, b: 6, c: 12 })
		// 3 tasks of 15ms in parallel should take roughly 15ms, not 45ms.
		expect(duration).toBeLessThan(40)
	})

	it('should process items in parallel within a single Node.exec', async () => {
		class Processor extends Node<number[], number[]> {
			async prep({ ctx }: NodeArgs): Promise<number[]> {
				return ctx.get('input')
			}

			async exec({ prepRes: items }: NodeArgs<number[]>): Promise<number[]> {
				const promises = items.map(item => this.processOne(item))
				return Promise.all(promises)
			}

			async processOne(item: number): Promise<number> {
				await new Promise(res => setTimeout(res, 10))
				return item * 2
			}

			async post({ ctx, execRes }: NodeArgs<number[], number[]>) {
				ctx.set('output', execRes)
			}
		}

		const ctx = new Map([['input', [1, 2, 3, 4]]])
		const node = new Processor()
		const startTime = Date.now()
		await node.run(ctx)
		const duration = Date.now() - startTime
		expect(ctx.get('output')).toEqual([2, 4, 6, 8])
		// 4 tasks of 10ms in parallel should take ~10ms, not 40ms.
		expect(duration).toBeLessThan(35)
	})
})

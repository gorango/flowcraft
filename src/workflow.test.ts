import type { Params, Context } from './workflow.js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
	AsyncBatchFlow,
	AsyncFlow,
	AsyncNode,
	AsyncParallelBatchFlow,
	BatchFlow,
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
	prep(ctx: Context) {
		ctx.set('current', this.number)
	}
}
class AddNode extends Node {
	constructor(private number: number) { super() }
	prep(ctx: Context) {
		ctx.set('current', ctx.get('current') + this.number)
	}
}
class MultiplyNode extends Node {
	constructor(private number: number) { super() }
	prep(ctx: Context) {
		ctx.set('current', ctx.get('current') * this.number)
	}
}
class CheckPositiveNode extends Node<void, void, string> {
	post(ctx: Context, prepRes: any, execRes: any, params: Params): string {
		return ctx.get('current') >= 0 ? 'positive' : 'negative'
	}
}
class SignalNode extends Node<void, void, string> {
	constructor(private signal = 'finished') { super() }
	post(): string {
		return this.signal
	}
}
class PathNode extends Node {
	constructor(private pathId: string) { super() }
	prep(ctx: Context) {
		ctx.set('path_taken', this.pathId)
	}
}

describe('testFlowBasic', () => {
	it('should handle a simple linear pipeline with rshift-like chaining', () => {
		const ctx = new Map()
		const n1 = new NumberNode(5)
		const n2 = new AddNode(3)
		const n3 = new MultiplyNode(2)
		const flow = new Flow()
		flow.start(n1).next(n2).next(n3)
		const lastAction = flow.run(ctx)
		expect(ctx.get('current')).toBe(16)
		expect(lastAction).toBe(DEFAULT_ACTION)
	})
	it('should handle positive branching', () => {
		const ctx = new Map()
		const startNode = new NumberNode(5)
		const checkNode = new CheckPositiveNode()
		const addIfPositive = new AddNode(10)
		const addIfNegative = new AddNode(-20)
		const flow = new Flow(startNode)
		startNode.next(checkNode)
		checkNode.next(addIfPositive, 'positive')
		checkNode.next(addIfNegative, 'negative')
		flow.run(ctx)
		expect(ctx.get('current')).toBe(15)
	})
	it('should handle negative branching', () => {
		const ctx = new Map()
		const startNode = new NumberNode(-5)
		const checkNode = new CheckPositiveNode()
		const addIfPositive = new AddNode(10)
		const addIfNegative = new AddNode(-20)
		const flow = new Flow(startNode)
		startNode.next(checkNode)
		checkNode.next(addIfPositive, 'positive')
		checkNode.next(addIfNegative, 'negative')
		flow.run(ctx)
		expect(ctx.get('current')).toBe(-25)
	})
	it('should return the final action from the last node in a cycle', () => {
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
		const lastAction = flow.run(ctx)
		expect(ctx.get('current')).toBe(-2)
		expect(lastAction).toBe('cycle_done')
	})
})
describe('testFlowComposition', () => {
	it('should treat a flow as a node in another flow', () => {
		const ctx = new Map()
		const innerFlow = new Flow(new NumberNode(5))
		innerFlow.startNode!.next(new AddNode(10)).next(new MultiplyNode(2))
		const outerFlow = new Flow(innerFlow)
		outerFlow.run(ctx)
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
		const outerFlow = new AsyncFlow(innerFlow) // Use AsyncFlow to compose sync nodes
		innerFlow.next(pathA, 'other_action')
		innerFlow.next(pathB, 'inner_done')
		await outerFlow.runAsync(ctx)
		expect(ctx.get('current')).toBe(100)
		expect(ctx.get('path_taken')).toBe('B')
	})
})
describe('testExecFallback', () => {
	class FallbackNode extends Node<void, string> {
		public attemptCount = 0
		constructor(private shouldFail: boolean, maxRetries: number) { super(maxRetries) }
		exec() {
			this.attemptCount++
			if (this.shouldFail)
				throw new Error('Intentional failure')
			return 'success'
		}

		execFallback() { return 'fallback' }
		post(ctx: Context, prepRes: any, execRes: any) {
			ctx.set('result', execRes)
			ctx.set('attempts', this.attemptCount)
			return DEFAULT_ACTION
		}
	}
	it('should call exec_fallback after all sync retries are exhausted', () => {
		const ctx = new Map()
		const node = new FallbackNode(true, 3)
		node.run(ctx)
		expect(ctx.get('attempts')).toBe(3)
		expect(ctx.get('result')).toBe('fallback')
	})
	class AsyncFallbackNode extends AsyncNode<void, string> {
		public attemptCount = 0
		constructor(private shouldFail: boolean, maxRetries: number) { super(maxRetries) }
		async execAsync() {
			this.attemptCount++
			if (this.shouldFail)
				throw new Error('Intentional async failure')
			return 'success'
		}

		async execFallbackAsync() { return 'async_fallback' }
		async postAsync(ctx: Context, prepRes: any, execRes: any) {
			ctx.set('result', execRes)
			ctx.set('attempts', this.attemptCount)
			return DEFAULT_ACTION
		}
	}
	it('should call exec_fallback_async after all async retries are exhausted', async () => {
		const ctx = new Map()
		const node = new AsyncFallbackNode(true, 3)
		await node.runAsync(ctx)
		expect(ctx.get('attempts')).toBe(3)
		expect(ctx.get('result')).toBe('async_fallback')
	})
})
describe('testBatchProcessing (Sync)', () => {
	class ArrayChunkNode extends Node<number[][], number[]> {
		constructor(private chunkSize: number) { super() }
		prep(ctx: Context): number[][] {
			const array: number[] = ctx.get('input_array') || []
			const chunks: number[][] = []
			for (let i = 0; i < array.length; i += this.chunkSize) {
				chunks.push(array.slice(i, i + this.chunkSize))
			}
			return chunks
		}

		exec(chunks: number[][]): number[] {
			return chunks.map(chunk => chunk.reduce((sum, val) => sum + val, 0))
		}

		post(ctx: Context, prepRes: number[][], execRes: number[]) {
			ctx.set('chunk_results', execRes)
			return DEFAULT_ACTION
		}
	}
	class SumReduceNode extends Node {
		prep(ctx: Context) {
			const chunkResults: number[] = ctx.get('chunk_results') || []
			ctx.set('total', chunkResults.reduce((sum, val) => sum + val, 0))
		}
	}
	it('should perform a map-reduce style operation using Node', () => {
		const ctx = new Map([['input_array', Array.from({ length: 100 }, (_, i) => i)]])
		const expectedSum = 4950
		const chunkNode = new ArrayChunkNode(10)
		const reduceNode = new SumReduceNode()
		chunkNode.next(reduceNode)
		const flow = new Flow(chunkNode)
		flow.run(ctx)
		expect(ctx.get('total')).toBe(expectedSum)
	})
	class DataProcessNode extends Node {
		prep(ctx: Context, params: Params) {
			const key = params.key
			const data = ctx.get('input_data')[key]
			if (!ctx.has('results'))
				ctx.set('results', {})
			ctx.get('results')[key] = data * 2
		}
	}
	it('should process items sequentially using BatchFlow', () => {
		const ctx = new Map([['input_data', { a: 1, b: 2, c: 3 }]])
		class SimpleBatchFlow extends BatchFlow {
			prep() { return [{ key: 'a' }, { key: 'b' }, { key: 'c' }] }
		}
		const flow = new SimpleBatchFlow(new DataProcessNode())
		flow.run(ctx)
		expect(ctx.get('results')).toEqual({ a: 2, b: 4, c: 6 })
	})
})
describe('testAsyncProcessing', () => {
	class AsyncDataProcessNode extends AsyncNode {
		async postAsync(ctx: Context, prepRes: any, execRes: any, params: Params) {
			const key = params.key
			const data = ctx.get('input_data')[key]
			await new Promise(res => setTimeout(res, 1))
			ctx.get('results')[key] = data * params.multiplier
			return DEFAULT_ACTION
		}
	}
	it('should run an AsyncBatchFlow sequentially', async () => {
		const ctx = new Map([
			['input_data', { a: 1, b: 2, c: 3 }],
			['results', {}],
		])
		class TestAsyncBatchFlow extends AsyncBatchFlow {
			async prepAsync() { return [{ key: 'a', multiplier: 2 }, { key: 'b', multiplier: 3 }, { key: 'c', multiplier: 4 }] }
		}
		const flow = new TestAsyncBatchFlow(new AsyncDataProcessNode())
		await flow.runAsync(ctx)
		expect(ctx.get('results')).toEqual({ a: 2, b: 6, c: 12 })
	})
	it('should run an AsyncParallelBatchFlow in parallel', async () => {
		const ctx = new Map([
			['input_data', { a: 1, b: 2, c: 3 }],
			['results', {}],
		])
		class TestAsyncParallelBatchFlow extends AsyncParallelBatchFlow {
			async prepAsync() { return [{ key: 'a', multiplier: 2 }, { key: 'b', multiplier: 3 }, { key: 'c', multiplier: 4 }] }
		}
		const flow = new TestAsyncParallelBatchFlow(new AsyncDataProcessNode())
		const startTime = Date.now()
		await flow.runAsync(ctx)
		const duration = Date.now() - startTime
		expect(ctx.get('results')).toEqual({ a: 2, b: 6, c: 12 })
		expect(duration).toBeLessThan(25)
	})
	class Processor extends AsyncNode<number[], number[]> {
		prepAsync(ctx: Context): Promise<number[]> {
			return Promise.resolve(ctx.get('input'))
		}

		async execAsync(items: number[]): Promise<number[]> {
			const promises = items.map(item => this.processOne(item))
			return Promise.all(promises)
		}

		async processOne(item: number): Promise<number> {
			await new Promise(res => setTimeout(res, 5))
			return item * 2
		}

		async postAsync(ctx: Context, prepRes: number[], execRes: number[]) {
			ctx.set('output', execRes)
			return DEFAULT_ACTION
		}
	}
	it('should process items with AsyncNode in parallel', async () => {
		const ctx = new Map([['input', [1, 2, 3, 4]]])
		const node = new Processor()
		const startTime = Date.now()
		await node.runAsync(ctx)
		const duration = Date.now() - startTime
		expect(ctx.get('output')).toEqual([2, 4, 6, 8])
		expect(duration).toBeLessThan(25)
	})
})

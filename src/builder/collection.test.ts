import type { AbstractNode, Logger, NodeArgs, RunOptions } from '../workflow'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contextKey, Flow, Node, TypedContext } from '../workflow'
import {
	BatchFlow,
	filterCollection,
	mapCollection,
	ParallelBatchFlow,
	ParallelFlow,
	reduceCollection,
	SequenceFlow,
} from './collection'

function createMockLogger(): Logger {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}
}

let mockLogger = createMockLogger()
let runOptions: RunOptions = { logger: mockLogger }

afterEach(() => {
	mockLogger = createMockLogger()
	runOptions = { logger: mockLogger }
})

const PROCESSED_IDS = contextKey<number[]>('processed_ids')
const BATCH_RESULTS = contextKey<string[]>('batch_results')
const VALUE = contextKey<number>('value')
const PATH = contextKey<string[]>('path')

class ProcessItemNode extends Node {
	async exec({ ctx, params }: NodeArgs) {
		const id: number = params.id
		const value: string = params.value

		const processed = ctx.get(PROCESSED_IDS) ?? []
		ctx.set(PROCESSED_IDS, [...processed, id])

		const results = ctx.get(BATCH_RESULTS) ?? []
		const newResult = `Item ${id}: Processed ${value}`
		ctx.set(BATCH_RESULTS, [...results, newResult])
	}
}

class AddNode extends Node {
	constructor(private number: number) { super() }
	async exec({ ctx }: NodeArgs) {
		const current = ctx.get(VALUE) ?? 0
		ctx.set(VALUE, current + this.number)
		const path = ctx.get(PATH) ?? []
		ctx.set(PATH, [...path, `add${this.number}`])
	}
}

describe('sequenceFlow', () => {
	it('should create and run a linear sequence of nodes', async () => {
		const ctx = new TypedContext([[VALUE, 1]])
		const flow = new SequenceFlow(
			new AddNode(5), // 1 + 5 = 6
			new AddNode(10), // 6 + 10 = 16
		)
		await flow.run(ctx, runOptions)
		expect(ctx.get(VALUE)).toBe(16)
	})
})

describe('batchFlow (Sequential)', () => {
	class TestSequentialBatchFlow extends BatchFlow {
		constructor(private items: any[], nodeToRun: AbstractNode) {
			super(nodeToRun) // Pass node to the new constructor
		}

		async prep() {
			return this.items
		}
	}
	it('should process all items in the specified order', async () => {
		const ctx = new TypedContext()
		const flow = new TestSequentialBatchFlow([ // Use the updated test class
			{ id: 1, value: 'A' },
			{ id: 2, value: 'B' },
			{ id: 3, value: 'C' },
		], new ProcessItemNode())
		await flow.run(ctx, runOptions)
		expect(ctx.get(PROCESSED_IDS)).toEqual([1, 2, 3])
		expect(ctx.get(BATCH_RESULTS)).toEqual([
			'Item 1: Processed A',
			'Item 2: Processed B',
			'Item 3: Processed C',
		])
	})
	it('should complete successfully with an empty batch', async () => {
		const ctx = new TypedContext()
		const flow = new TestSequentialBatchFlow([], new ProcessItemNode())
		await flow.run(ctx, runOptions)
		expect(ctx.get(PROCESSED_IDS)).toBeUndefined()
		expect(ctx.get(BATCH_RESULTS)).toBeUndefined()
		expect(mockLogger.info).toHaveBeenCalledWith(
			'[BatchFlow] Starting sequential processing of 0 items.',
		)
	})
	it('should pass parent flow parameters to each batch item', async () => {
		const ctx = new TypedContext()
		const flow = new TestSequentialBatchFlow([
			{ id: 1 },
			{ id: 2 },
		], new ProcessItemNode())
		flow.withParams({ value: 'shared' })
		await flow.run(ctx, runOptions)
		expect(ctx.get(BATCH_RESULTS)).toEqual([
			'Item 1: Processed shared',
			'Item 2: Processed shared',
		])
	})
})

describe('parallelBatchFlow', () => {
	class TestParallelBatchFlow extends ParallelBatchFlow {
		constructor(private items: any[], nodeToRun: AbstractNode) {
			super(nodeToRun) // Pass node to the new constructor
		}

		async prep() {
			return this.items
		}
	}
	it('should process all items', async () => {
		const ctx = new TypedContext()
		const flow = new TestParallelBatchFlow([
			{ id: 1, value: 'A' },
			{ id: 2, value: 'B' },
			{ id: 3, value: 'C' },
		], new ProcessItemNode())
		await flow.run(ctx, runOptions)
		// In parallel, order is not guaranteed, so we check for presence and size.
		const processedIds = ctx.get(PROCESSED_IDS)
		expect(processedIds).toHaveLength(3)
		expect(processedIds).toContain(1)
		expect(processedIds).toContain(2)
		expect(processedIds).toContain(3)
		const results = ctx.get(BATCH_RESULTS)
		expect(results).toHaveLength(3)
		expect(results).toContain('Item 1: Processed A')
		expect(results).toContain('Item 2: Processed B')
		expect(results).toContain('Item 3: Processed C')
	})
	it('should complete successfully with an empty batch', async () => {
		const ctx = new TypedContext()
		const flow = new TestParallelBatchFlow([], new ProcessItemNode())
		await flow.run(ctx, runOptions)
		expect(ctx.get(PROCESSED_IDS)).toBeUndefined()
		expect(ctx.get(BATCH_RESULTS)).toBeUndefined()
		expect(mockLogger.info).toHaveBeenCalledWith(
			'[ParallelBatchFlow] Starting parallel processing of 0 items.',
		)
	})
})

describe('parallelFlow', () => {
	it('should run all nodes in parallel and then proceed', async () => {
		const ctx = new TypedContext([[VALUE, 0]])
		const pFlow = new ParallelFlow([
			new AddNode(1),
			new AddNode(10),
			new AddNode(100),
		])
		const finalNode = new AddNode(1000)
		pFlow.next(finalNode)

		await new Flow(pFlow).run(ctx, runOptions)

		// The parallel AddNodes will race. The final value depends on execution order,
		// but the path should be correct. Let's verify the final step.
		// Expected path: add1, add10, add100 (in any order), then add1000
		const path = ctx.get(PATH)
		expect(path).toHaveLength(4)
		expect(path).toContain('add1')
		expect(path).toContain('add10')
		expect(path).toContain('add100')
		expect(path![3]).toBe('add1000') // Final node must be last

		// Verify the final sum
		expect(ctx.get(VALUE)).toBe(1111)
	})

	it('should handle an empty parallel flow', async () => {
		const ctx = new TypedContext()
		const pFlow = new ParallelFlow([])
		const finalNode = new AddNode(5)
		pFlow.next(finalNode)

		await new Flow(pFlow).run(ctx, runOptions)
		expect(ctx.get(VALUE)).toBe(5)
	})
})

describe('functionalHelpers', () => {
	describe('mapCollection', () => {
		it('should map items using a synchronous function', async () => {
			const items = [1, 2, 3]
			const double = (n: number) => n * 2
			const flow = mapCollection(items, double)
			const result = await flow.run(new TypedContext(), runOptions)
			expect(result).toEqual([2, 4, 6])
		})
		it('should map items using an asynchronous function', async () => {
			const items = ['a', 'b', 'c']
			const toUpper = async (s: string) => {
				await new Promise(resolve => setTimeout(resolve, 1))
				return s.toUpperCase()
			}
			const flow = mapCollection(items, toUpper)
			const result = await flow.run(new TypedContext(), runOptions)
			expect(result).toEqual(['A', 'B', 'C'])
		})
		it('should handle an empty collection', async () => {
			const items: number[] = []
			const double = (n: number) => n * 2
			const flow = mapCollection(items, double)
			const result = await flow.run(new TypedContext(), runOptions)
			expect(result).toEqual([])
		})
	})

	describe('filterCollection', () => {
		it('should filter items using a synchronous predicate', async () => {
			const items = [1, 2, 3, 4, 5]
			const isEven = (n: number) => n % 2 === 0
			const flow = filterCollection(items, isEven)
			const result = await flow.run(new TypedContext(), runOptions)
			expect(result).toEqual([2, 4])
		})
		it('should filter items using an asynchronous predicate', async () => {
			const items = ['short', 'long-word', 'tiny', 'another-long-word']
			const isLong = async (s: string) => {
				await new Promise(resolve => setTimeout(resolve, 1))
				return s.length > 5
			}
			const flow = filterCollection(items, isLong)
			const result = await flow.run(new TypedContext(), runOptions)
			expect(result).toEqual(['long-word', 'another-long-word'])
		})
		it('should handle an empty collection', async () => {
			const items: string[] = []
			const isLong = (s: string) => s.length > 5
			const flow = filterCollection(items, isLong)
			const result = await flow.run(new TypedContext(), runOptions)
			expect(result).toEqual([])
		})
	})

	describe('reduceCollection', () => {
		it('should reduce a collection using a synchronous reducer', async () => {
			const items = [1, 2, 3, 4]
			const sum = (acc: number, val: number) => acc + val
			const flow = reduceCollection(items, sum, 0)
			const result = await flow.run(new TypedContext(), runOptions)
			expect(result).toBe(10)
		})
		it('should reduce a collection using an asynchronous reducer', async () => {
			const items = ['a', 'b', 'c']
			const concatUpper = async (acc: string, val: string) => {
				await new Promise(resolve => setTimeout(resolve, 1))
				return acc + val.toUpperCase()
			}
			const flow = reduceCollection(items, concatUpper, 'start:')
			const result = await flow.run(new TypedContext(), runOptions)
			expect(result).toBe('start:ABC')
		})
		it('should return the initial value for an empty collection', async () => {
			const items: number[] = []
			const sum = (acc: number, val: number) => acc + val
			const flow = reduceCollection(items, sum, 100)
			const result = await flow.run(new TypedContext(), runOptions)
			expect(result).toBe(100)
		})
	})
})

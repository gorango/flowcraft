import type { ContextKey } from '../context'
import type { NodeArgs } from '../types'
import type { AbstractNode } from '../workflow/index'
import { describe, expect, it } from 'vitest'
import { contextKey, TypedContext } from '../context'
import { globalRunOptions } from '../test-utils'
import { Flow, Node } from '../workflow/index'
import {
	BatchFlow,
	filterCollection,
	mapCollection,
	ParallelBatchFlow,
	ParallelFlow,
	reduceCollection,
	SequenceFlow,
} from './patterns'

const PROCESSED_IDS = contextKey<number[]>('processed_ids')
const BATCH_RESULTS = contextKey<string[]>('batch_results')
const VALUE = contextKey<number>('value')
const PATH = contextKey<string[]>('path')

class SequentialProcessItemNode extends Node {
	async exec({ ctx, params }: NodeArgs) {
		const id: number = params.id
		const value: string = params.value

		const processed = (await ctx.get(PROCESSED_IDS)) ?? []
		await ctx.set(PROCESSED_IDS, [...processed, id])

		const results = (await ctx.get(BATCH_RESULTS)) ?? []
		const newResult = `Item ${id}: Processed ${value}`
		await ctx.set(BATCH_RESULTS, [...results, newResult])
	}
}

class ParallelProcessItemNode extends Node {
	async exec({ ctx, params }: NodeArgs) {
		const id: number = params.id
		await ctx.set(`processed_${id}`, true)
		await ctx.set(`result_${id}`, `Item ${id}: Processed ${params.value}`)
	}
}

class AddNode extends Node {
	constructor(private number: number) { super() }
	async exec({ ctx }: NodeArgs) {
		const current = (await ctx.get(VALUE)) ?? 0
		await ctx.set(VALUE, current + this.number)

		const path = (await ctx.get(PATH)) ?? []
		await ctx.set(PATH, [...path, `add${this.number}`])
	}
}

describe('sequenceFlow', () => {
	it('should create and run a linear sequence of nodes', async () => {
		const ctx = new TypedContext([[VALUE, 1]])
		const flow = new SequenceFlow(
			new AddNode(5), // 1 + 5 = 6
			new AddNode(10), // 6 + 10 = 16
		)
		await flow.run(ctx, globalRunOptions)
		expect(await ctx.get(VALUE)).toBe(16)
	})
})

describe('batchFlow (Sequential)', () => {
	class TestSequentialBatchFlow extends BatchFlow {
		protected nodeToRun: AbstractNode = new SequentialProcessItemNode()

		constructor(private items: any[]) {
			super()
		}

		async prep() {
			return this.items
		}
	}
	it('should process all items in the specified order', async () => {
		const ctx = new TypedContext()
		const flow = new TestSequentialBatchFlow([
			{ id: 1, value: 'A' },
			{ id: 2, value: 'B' },
			{ id: 3, value: 'C' },
		])
		await flow.run(ctx, globalRunOptions)
		expect(await ctx.get(PROCESSED_IDS)).toEqual([1, 2, 3])
		expect(await ctx.get(BATCH_RESULTS)).toEqual([
			'Item 1: Processed A',
			'Item 2: Processed B',
			'Item 3: Processed C',
		])
	})
	it('should complete successfully with an empty batch', async () => {
		const ctx = new TypedContext()
		const flow = new TestSequentialBatchFlow([])
		await flow.run(ctx, globalRunOptions)
		expect(Array.from(ctx.entries())).toHaveLength(0)
	})
	it('should pass parent flow parameters to each batch item', async () => {
		const ctx = new TypedContext()
		const flow = new TestSequentialBatchFlow([
			{ id: 1 },
			{ id: 2 },
		])
		flow.withParams({ value: 'shared' })
		await flow.run(ctx, globalRunOptions)
		expect(await ctx.get(BATCH_RESULTS)).toEqual([
			'Item 1: Processed shared',
			'Item 2: Processed shared',
		])
	})
})

describe('parallelBatchFlow', () => {
	class TestParallelBatchFlow extends ParallelBatchFlow {
		protected nodeToRun: AbstractNode = new ParallelProcessItemNode()

		constructor(private items: any[]) {
			super()
		}

		async prep() {
			return this.items
		}
	}
	it('should process all items', async () => {
		const ctx = new TypedContext()
		const items = [
			{ id: 1, value: 'A' },
			{ id: 2, value: 'B' },
			{ id: 3, value: 'C' },
		]
		const flow = new TestParallelBatchFlow(items)
		await flow.run(ctx, globalRunOptions)

		for (const item of items) {
			expect(await ctx.get(`processed_${item.id}`)).toBe(true)
			expect(await ctx.get(`result_${item.id}`)).toBe(`Item ${item.id}: Processed ${item.value}`)
		}
	})

	it('should complete successfully with an empty batch', async () => {
		const ctx = new TypedContext()
		const flow = new TestParallelBatchFlow([])
		await flow.run(ctx, globalRunOptions)
		expect(Array.from(ctx.entries())).toHaveLength(0)
	})
})

describe('parallelFlow', () => {
	it('should run all nodes in parallel and then proceed', async () => {
		const ctx = new TypedContext()

		const P_VAL_1 = contextKey<number>('p_val_1')
		const P_VAL_10 = contextKey<number>('p_val_10')
		const P_VAL_100 = contextKey<number>('p_val_100')

		class SetValueNode extends Node {
			constructor(private key: ContextKey<number>, private value: number) {
				super()
			}

			async exec({ ctx }: NodeArgs) {
				await ctx.set(this.key, this.value)
			}
		}

		class SumResultsNode extends Node {
			constructor(private number: number) {
				super()
			}

			async exec({ ctx }: NodeArgs) {
				const v1 = (await ctx.get(P_VAL_1)) ?? 0
				const v10 = (await ctx.get(P_VAL_10)) ?? 0
				const v100 = (await ctx.get(P_VAL_100)) ?? 0
				await ctx.set(VALUE, v1 + v10 + v100 + this.number)

				const path = ['add1', 'add10', 'add100', `add${this.number}`]
				await ctx.set(PATH, path)
			}
		}

		const pFlow = new ParallelFlow([
			new SetValueNode(P_VAL_1, 1),
			new SetValueNode(P_VAL_10, 10),
			new SetValueNode(P_VAL_100, 100),
		])
		const finalNode = new SumResultsNode(1000)
		pFlow.next(finalNode)

		await new Flow(pFlow).run(ctx, globalRunOptions)

		expect(await ctx.get(VALUE)).toBe(1111)

		const path = await ctx.get(PATH)
		expect(path).toHaveLength(4)
		expect(path).toContain('add1')
		expect(path).toContain('add10')
		expect(path).toContain('add100')
		expect(path![3]).toBe('add1000')
	})

	it('should handle an empty parallel flow', async () => {
		const ctx = new TypedContext()
		const pFlow = new ParallelFlow([])
		const finalNode = new AddNode(5)
		pFlow.next(finalNode)

		await new Flow(pFlow).run(ctx, globalRunOptions)
		expect(await ctx.get(VALUE)).toBe(5)
	})
})

describe('functionalHelpers', () => {
	describe('mapCollection', () => {
		it('should map items using a synchronous function', async () => {
			const items = [1, 2, 3]
			const double = (n: number) => n * 2
			const flow = mapCollection(items, double)
			const result = await flow.run(new TypedContext(), globalRunOptions)
			expect(result).toEqual([2, 4, 6])
		})
		it('should map items using an asynchronous function', async () => {
			const items = ['a', 'b', 'c']
			const toUpper = async (s: string) => {
				await new Promise(resolve => setTimeout(resolve, 1))
				return s.toUpperCase()
			}
			const flow = mapCollection(items, toUpper)
			const result = await flow.run(new TypedContext(), globalRunOptions)
			expect(result).toEqual(['A', 'B', 'C'])
		})
		it('should handle an empty collection', async () => {
			const items: number[] = []
			const double = (n: number) => n * 2
			const flow = mapCollection(items, double)
			const result = await flow.run(new TypedContext(), globalRunOptions)
			expect(result).toEqual([])
		})
	})

	describe('filterCollection', () => {
		it('should filter items using a synchronous predicate', async () => {
			const items = [1, 2, 3, 4, 5]
			const isEven = (n: number) => n % 2 === 0
			const flow = filterCollection(items, isEven)
			const result = await flow.run(new TypedContext(), globalRunOptions)
			expect(result).toEqual([2, 4])
		})
		it('should filter items using an asynchronous predicate', async () => {
			const items = ['short', 'long-word', 'tiny', 'another-long-word']
			const isLong = async (s: string) => {
				await new Promise(resolve => setTimeout(resolve, 1))
				return s.length > 5
			}
			const flow = filterCollection(items, isLong)
			const result = await flow.run(new TypedContext(), globalRunOptions)
			expect(result).toEqual(['long-word', 'another-long-word'])
		})
		it('should handle an empty collection', async () => {
			const items: string[] = []
			const isLong = (s: string) => s.length > 5
			const flow = filterCollection(items, isLong)
			const result = await flow.run(new TypedContext(), globalRunOptions)
			expect(result).toEqual([])
		})
	})

	describe('reduceCollection', () => {
		it('should reduce a collection using a synchronous reducer', async () => {
			const items = [1, 2, 3, 4]
			const sum = (acc: number, val: number) => acc + val
			const flow = reduceCollection(items, sum, 0)
			const result = await flow.run(new TypedContext(), globalRunOptions)
			expect(result).toBe(10)
		})
		it('should reduce a collection using an asynchronous reducer', async () => {
			const items = ['a', 'b', 'c']
			const concatUpper = async (acc: string, val: string) => {
				await new Promise(resolve => setTimeout(resolve, 1))
				return acc + val.toUpperCase()
			}
			const flow = reduceCollection(items, concatUpper, 'start:')
			const result = await flow.run(new TypedContext(), globalRunOptions)
			expect(result).toBe('start:ABC')
		})
		it('should return the initial value for an empty collection', async () => {
			const items: number[] = []
			const sum = (acc: number, val: number) => acc + val
			const flow = reduceCollection(items, sum, 100)
			const result = await flow.run(new TypedContext(), globalRunOptions)
			expect(result).toBe(100)
		})
	})
})

import type { Logger, NodeArgs, RunOptions } from '../workflow'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contextKey, Node, TypedContext } from '../workflow'
import { BatchFlow, ParallelBatchFlow, SequenceFlow } from './collection'

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
	async prep({ ctx }: NodeArgs) {
		const current = ctx.get(VALUE) ?? 0
		ctx.set(VALUE, current + this.number)
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
		constructor(private items: any[]) {
			super(new ProcessItemNode())
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
		const flow = new TestSequentialBatchFlow([])
		await flow.run(ctx, runOptions)
		expect(ctx.get(PROCESSED_IDS)).toBeUndefined()
		expect(ctx.get(BATCH_RESULTS)).toBeUndefined()
		expect(mockLogger.info).toHaveBeenCalledWith(
			'BatchFlow: Starting sequential processing of 0 items.',
		)
	})
	it('should pass parent flow parameters to each batch item', async () => {
		const ctx = new TypedContext()
		const flow = new TestSequentialBatchFlow([
			{ id: 1 },
			{ id: 2 },
		])
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
		constructor(private items: any[]) {
			super(new ProcessItemNode())
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
		])
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
		const flow = new TestParallelBatchFlow([])
		await flow.run(ctx, runOptions)
		expect(ctx.get(PROCESSED_IDS)).toBeUndefined()
		expect(ctx.get(BATCH_RESULTS)).toBeUndefined()
		expect(mockLogger.info).toHaveBeenCalledWith(
			'ParallelBatchFlow: Starting parallel processing of 0 items.',
		)
	})
})

import type { ContextKey } from '../context'
import type { NodeArgs, NodeOptions } from '../types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { composeContext, contextKey, lens, TypedContext } from '../context'
import { WorkflowError } from '../errors'
import { globalRunOptions } from '../test-utils'
import { DEFAULT_ACTION, FILTER_FAILED } from '../types'
import { sleep } from '../utils'
import { Flow } from './Flow'
import { Node } from './Node'

const RESULT = contextKey<string>('result')
const ATTEMPTS = contextKey<number>('attempts')
const NAME = contextKey<string>('name')
const COUNTER = contextKey<number>('counter')
const FINAL_RESULT = contextKey<string>('final_result')
const LENS_VALUE = contextKey<number>('lens_value')

class ValueNode<T> extends Node<void, T> {
	constructor(private value: T, options?: NodeOptions) { super(options) }
	async exec(): Promise<T> {
		return this.value
	}
}
class ReadContextNode<T> extends Node<void, T | undefined> {
	constructor(private key: ContextKey<T>) { super() }
	async exec({ ctx }: NodeArgs): Promise<T | undefined> {
		return await ctx.get(this.key)
	}
}

describe('Node', () => {
	describe('execFallback', () => {
		class FallbackNode extends Node<void, string> {
			public attemptCount = 0
			private shouldFail: boolean

			constructor(shouldFail: boolean, options?: NodeOptions) {
				super(options) // Pass options to the parent
				this.shouldFail = shouldFail
			}

			async exec(): Promise<string> {
				this.attemptCount++
				if (this.shouldFail)
					throw new Error('Intentional failure')

				return 'success'
			}

			async execFallback(): Promise<string> { return 'fallback' }
			async post({ ctx, execRes }: NodeArgs<void, string>) {
				ctx.set(RESULT, execRes)
				ctx.set(ATTEMPTS, this.attemptCount)
			}
		}

		it('should call execFallback after all retries are exhausted', async () => {
			const ctx = new TypedContext()
			const node = new FallbackNode(true, { maxRetries: 3 })
			await node.run(ctx, globalRunOptions)
			expect(await ctx.get(ATTEMPTS)).toBe(3) // 1 initial attempt + 2 retries
			expect(await ctx.get(RESULT)).toBe('fallback')
		})
	})

	describe('logging and errors', () => {
		const mockLogger = {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		}
		const localRunOptions = { logger: mockLogger }

		beforeEach(() => {
			vi.clearAllMocks()
		})

		it('should be silent by default if no logger is provided', async () => {
			const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => { })
			const node = new Node()
			await new Flow(node).run(new TypedContext())
			expect(consoleInfoSpy).not.toHaveBeenCalled()
			consoleInfoSpy.mockRestore()
		})

		it('should log retry attempts and fallback execution', async () => {
			class FailingNode extends Node {
				constructor() { super({ maxRetries: 2, wait: 0 }) }
				async exec() { throw new Error('fail') }
				async execFallback() { return 'fallback' }
			}
			await new FailingNode().run(new TypedContext(), localRunOptions)
			expect(mockLogger.warn).toHaveBeenCalledWith(
				'Attempt 1/2 failed for FailingNode. Retrying...',
				expect.any(Object),
			)
			expect(mockLogger.error).toHaveBeenCalledWith(
				'All retries failed for FailingNode. Executing fallback.',
				expect.any(Object),
			)
		})

		it('should wrap errors in WorkflowError with correct phase context and message', async () => {
			class FailingPrepNode extends Node {
				async prep() { throw new Error('Prep failed') }
			}
			const runPromise = new FailingPrepNode().run(new TypedContext(), localRunOptions)
			await expect(runPromise).rejects.toThrow(WorkflowError)
			await expect(runPromise).rejects.toMatchObject({
				name: 'WorkflowError',
				nodeName: 'FailingPrepNode',
				phase: 'prep',
				message: 'Failed in prep phase for node FailingPrepNode: Prep failed',
				originalError: expect.objectContaining({ message: 'Prep failed' }),
			})
		})
	})

	describe('functional methods', () => {
		it('map() should transform the execution result', async () => {
			const node = new ValueNode({ value: 10 }).map(res => `Value is ${res.value}`)
			const resultNode = node.toContext(FINAL_RESULT)
			const ctx = new TypedContext()
			await resultNode.run(ctx, globalRunOptions)
			expect(await ctx.get(FINAL_RESULT)).toBe('Value is 10')
		})

		it('map() should handle async transformations', async () => {
			const node = new ValueNode('hello').map(async (res) => {
				await sleep(1)
				return res.toUpperCase()
			})
			const resultNode = node.toContext(FINAL_RESULT)
			const ctx = new TypedContext()
			await resultNode.run(ctx, globalRunOptions)
			expect(await ctx.get(FINAL_RESULT)).toBe('HELLO')
		})

		it('toContext() should set the execution result in the context', async () => {
			const node = new ValueNode('success').toContext(FINAL_RESULT)
			const ctx = new TypedContext()
			await node.run(ctx, globalRunOptions)
			expect(await ctx.get(FINAL_RESULT)).toBe('success')
		})

		it('tap() should perform a side effect without altering the result', async () => {
			const sideEffect = vi.fn()
			const node = new ValueNode(42)
				.tap(sideEffect)
				.map(res => res + 1)
				.toContext(COUNTER)
			const ctx = new TypedContext()
			await node.run(ctx, globalRunOptions)
			expect(sideEffect).toHaveBeenCalledWith(42)
			expect(await ctx.get(COUNTER)).toBe(43)
		})

		it('filter() should route to DEFAULT_ACTION when predicate is true', async () => {
			const node = new ValueNode(100).filter(res => res > 50)
			const action = await node.run(new TypedContext(), globalRunOptions)
			expect(action).toBe(DEFAULT_ACTION)
		})

		it('filter() should route to FILTER_FAILED when predicate is false', async () => {
			const node = new ValueNode(10).filter(res => res > 50)
			const action = await node.run(new TypedContext(), globalRunOptions)
			expect(action).toBe(FILTER_FAILED)
		})

		it('withLens() should modify context before execution', async () => {
			const valueLens = lens(LENS_VALUE)
			const node = new ReadContextNode(LENS_VALUE)
				.withLens(valueLens, 99)
				.map(res => (res ?? -1) + 1)
				.toContext(COUNTER)
			const ctx = new TypedContext()
			await node.run(ctx, globalRunOptions)
			expect(await ctx.get(COUNTER)).toBe(100)
		})

		it('should allow chaining of multiple functional methods', async () => {
			const sideEffect = vi.fn()
			const valueLens = lens(LENS_VALUE)
			const node = new ReadContextNode(LENS_VALUE)
				.withLens(valueLens, 50)
				.tap(sideEffect)
				.map(val => `The number is ${val}`)
				.filter(str => str.includes('50'))
				.toContext(FINAL_RESULT)
			const ctx = new TypedContext()
			const action = await node.run(ctx, globalRunOptions)
			expect(sideEffect).toHaveBeenCalledWith(50)
			expect(await ctx.get(FINAL_RESULT)).toBe('The number is 50')
			expect(action).toBe(DEFAULT_ACTION)
		})
	})
})

describe('Context Utilities', () => {
	it('lens should get and set values correctly', async () => {
		const nameLens = lens(NAME)
		const ctx = new TypedContext()
		const setNameTransform = nameLens.set('Alice')
		await setNameTransform(ctx)
		expect(await nameLens.get(ctx)).toBe('Alice')
		expect(await ctx.get(NAME)).toBe('Alice')
	})

	it('lens should update values based on the current value', async () => {
		const counterLens = lens(COUNTER)
		const ctx = new TypedContext([[COUNTER, 5]])
		const incrementTransform = counterLens.update(current => (current ?? 0) + 1)
		await incrementTransform(ctx)
		expect(await counterLens.get(ctx)).toBe(6)
		const newCtx = new TypedContext()
		await incrementTransform(newCtx)
		expect(await counterLens.get(newCtx)).toBe(1)
	})

	it('composeContext should apply multiple transformations in order', async () => {
		const nameLens = lens(NAME)
		const counterLens = lens(COUNTER)
		const ctx = new TypedContext([[COUNTER, 10]])
		const composedTransform = composeContext(
			nameLens.set('Bob'),
			counterLens.update(c => (c ?? 0) * 2),
		)
		await composedTransform(ctx)
		expect(await nameLens.get(ctx)).toBe('Bob')
		expect(await counterLens.get(ctx)).toBe(20)
	})
})

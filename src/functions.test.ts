import { describe, expect, it, vi } from 'vitest'
import { contextKey, lens, TypedContext } from './context'
import {
	compose,
	contextNode,
	mapNode,
	pipeline,
	transformNode,
} from './functions'
import { globalRunOptions } from './test-utils'
import { DEFAULT_ACTION } from './types'

const NAME = contextKey<string>('name')
const COUNTER = contextKey<number>('counter')
const RESULT = contextKey<any>('result')
const PREFIX = contextKey<string>('prefix')

describe('mapNode', () => {
	it('should create a node from a synchronous function', async () => {
		const ctx = new TypedContext()
		const doubleNode = mapNode<{ value: number }, number>(params => params.value * 2)
			.toContext(RESULT)
		await doubleNode.withParams({ value: 10 }).run(ctx, globalRunOptions)
		expect(await ctx.get(RESULT)).toBe(20)
	})

	it('should create a node from an asynchronous function', async () => {
		const ctx = new TypedContext()
		const upperNode = mapNode<{ value: string }, string>(async params => params.value.toUpperCase())
			.toContext(RESULT)
		await upperNode.withParams({ value: 'hello' }).run(ctx, globalRunOptions)
		expect(await ctx.get(RESULT)).toBe('HELLO')
	})

	it('should handle nodes that produce no output', async () => {
		const ctx = new TypedContext()
		const sideEffectFn = vi.fn()
		const tapNode = mapNode<any, void>(params => sideEffectFn(params.value))
		await tapNode.withParams({ value: 123 }).run(ctx, globalRunOptions)
		expect(sideEffectFn).toHaveBeenCalledWith(123)
		const action = await tapNode.withParams({ value: 456 }).run(ctx, globalRunOptions)
		expect(Array.from(ctx.entries())).toHaveLength(0)
		expect(action).toBe(DEFAULT_ACTION)
	})
})

describe('contextNode', () => {
	it('should access context and params in a synchronous function', async () => {
		const ctx = new TypedContext([[PREFIX, 'Hello']])
		const greeterNode = contextNode<{ name: string }, string>(async (ctx, params) => {
			const prefix = await ctx.get(PREFIX) ?? 'Default'
			return `${prefix}, ${params.name}!`
		}).toContext(RESULT)
		await greeterNode.withParams({ name: 'World' }).run(ctx, globalRunOptions)
		expect(await ctx.get(RESULT)).toBe('Hello, World!')
	})

	it('should access context and params in an asynchronous function', async () => {
		const ctx = new TypedContext([[PREFIX, 'Hola']])
		const greeterNode = contextNode<{ name: string }, string>(async (ctx, params) => {
			const prefix = await ctx.get(PREFIX)
			await new Promise(resolve => setTimeout(resolve, 1))
			return `${prefix}, ${params.name}!`
		}).toContext(RESULT)
		await greeterNode.withParams({ name: 'Mundo' }).run(ctx, globalRunOptions)
		expect(await ctx.get(RESULT)).toBe('Hola, Mundo!')
	})
})

describe('transformNode', () => {
	it('should apply a single context transform', async () => {
		const ctx = new TypedContext()
		const nameLens = lens(NAME)
		const setNode = transformNode(nameLens.set('Alice'))
		await setNode.run(ctx, globalRunOptions)
		expect(await ctx.get(NAME)).toBe('Alice')
	})

	it('should apply multiple context transforms in order', async () => {
		const ctx = new TypedContext([[COUNTER, 10]])
		const nameLens = lens(NAME)
		const counterLens = lens(COUNTER)
		const setupNode = transformNode(
			nameLens.set('Bob'),
			counterLens.update(c => (c ?? 0) + 5),
		)
		await setupNode.run(ctx, globalRunOptions)
		expect(await ctx.get(NAME)).toBe('Bob')
		expect(await ctx.get(COUNTER)).toBe(15)
	})

	it('should be chainable within a pipeline', async () => {
		const ctx = new TypedContext([[COUNTER, 0]])
		const nameLens = lens(NAME)
		const counterLens = lens(COUNTER)
		// A node that reads from context
		const readNode = contextNode(async (ctx) => {
			return `${await ctx.get(NAME)} has ${await ctx.get(COUNTER)} points`
		}).toContext(RESULT)
		const flow = pipeline(
			transformNode(
				nameLens.set('Carol'),
				counterLens.set(100),
			),
			readNode,
		)
		await flow.run(ctx, globalRunOptions)
		expect(await ctx.get(RESULT)).toBe('Carol has 100 points')
	})
})

describe('pipeline', () => {
	it('should create and run a linear sequence of nodes', async () => {
		const ctx = new TypedContext([[COUNTER, 5]])
		const add10 = mapNode(() => 10).toContext(COUNTER)
		const multiplyBy3 = contextNode(async ctx => (await ctx.get(COUNTER) ?? 0) * 3).toContext(COUNTER)
		const flow = pipeline(add10, multiplyBy3)
		await flow.run(ctx, globalRunOptions)
		expect(await ctx.get(COUNTER)).toBe(30)
	})

	it('should run successfully with an empty sequence', async () => {
		const ctx = new TypedContext()
		const emptyFlow = pipeline()
		const action = await emptyFlow.run(ctx, globalRunOptions)
		expect(Array.from(ctx.entries())).toHaveLength(0)
		expect(action).toBe(DEFAULT_ACTION)
	})
})

describe('compose', () => {
	it('should compose two synchronous functions', async () => {
		const add5 = (x: number) => x + 5
		const multiply2 = (x: number) => x * 2
		// multiply2(add5(x)) => (x + 5) * 2
		const addThenMultiply = compose(multiply2, add5)
		expect(await addThenMultiply(10)).toBe(30)
	})

	it('should compose two asynchronous functions', async () => {
		const add5Async = async (x: number) => {
			await new Promise(resolve => setTimeout(resolve, 1))
			return x + 5
		}
		const multiply2Async = async (x: number) => {
			await new Promise(resolve => setTimeout(resolve, 1))
			return x * 2
		}
		const composed = compose(multiply2Async, add5Async)
		expect(await composed(10)).toBe(30)
	})

	it('should compose mixed sync and async functions', async () => {
		const add5 = (x: number) => x + 5
		const multiply2Async = async (x: number) => x * 2
		const composed1 = compose(multiply2Async, add5) // async(sync(x))
		const composed2 = compose(add5, multiply2Async) // sync(async(x))
		expect(await composed1(10)).toBe(30)
		expect(await composed2(10)).toBe(25)
	})

	it('should be usable inside a mapNode', async () => {
		const ctx = new TypedContext()
		const add5 = (p: { val: number }) => ({ ...p, val: p.val + 5 })
		const multiply2 = (p: { val: number }) => ({ ...p, val: p.val * 2 })
		const composedFn = compose(multiply2, add5)
		const processNode = mapNode(composedFn)
			.map(res => res.val)
			.toContext(RESULT)
		await processNode.withParams({ val: 10 }).run(ctx, globalRunOptions)
		expect(await ctx.get(RESULT)).toBe(30) // (10 + 5) * 2
	})
})

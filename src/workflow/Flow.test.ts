import type { AbstractNode } from './AbstractNode'
import { describe, expect, it } from 'vitest'
import { BatchFlow, ParallelBatchFlow } from '../builder/patterns'
import { contextKey, TypedContext } from '../context'
import { AbortError, FatalWorkflowError } from '../errors'
import { globalRunOptions } from '../test-utils'
import { DEFAULT_ACTION } from '../types'
import { sleep } from '../utils/index'
import { Flow } from './Flow'
import { Node } from './Node'

const CURRENT = contextKey<number>('current')
const PATH_TAKEN = contextKey<string>('path_taken')
const MIDDLEWARE_PATH = contextKey<string[]>('middleware_path')
const ATTEMPTS = contextKey<number>('attempts')

class NumberNode extends Node {
	constructor(private number: number) { super() }
	async prep({ ctx }: any) {
		ctx.set(CURRENT, this.number)
	}
}
class AddNode extends Node {
	constructor(private number: number) { super() }
	async prep({ ctx }: any) {
		const current = await ctx.get(CURRENT) ?? 0
		ctx.set(CURRENT, current + this.number)
	}
}
class MultiplyNode extends Node {
	constructor(private number: number) { super() }
	async prep({ ctx }: any) {
		const current = await ctx.get(CURRENT) ?? 1
		ctx.set(CURRENT, current * this.number)
	}
}
class CheckPositiveNode extends Node<void, void, string> {
	async post({ ctx }: any): Promise<string> {
		const current = await ctx.get(CURRENT)! ?? 0
		return current >= 0 ? 'positive' : 'negative'
	}
}
class SignalNode extends Node<void, void, string | typeof DEFAULT_ACTION> {
	constructor(private signal: string | typeof DEFAULT_ACTION = DEFAULT_ACTION) { super() }
	async post(): Promise<string | typeof DEFAULT_ACTION> {
		return this.signal
	}
}
class PathNode extends Node {
	constructor(private pathId: string) { super() }
	async prep({ ctx }: any) {
		ctx.set(PATH_TAKEN, this.pathId)
	}
}

describe('Flow', () => {
	describe('basic orchestration', () => {
		it('should handle a simple linear pipeline', async () => {
			const ctx = new TypedContext()
			const n1 = new NumberNode(5)
			const n2 = new AddNode(3)
			const n3 = new MultiplyNode(2)
			const flow = new Flow()
			flow.start(n1).next(n2).next(n3)
			const lastAction = await flow.run(ctx, globalRunOptions)
			expect(await ctx.get(CURRENT)).toBe(16)
			expect(lastAction).toBe(DEFAULT_ACTION)
		})

		it('should handle positive branching', async () => {
			const ctx = new TypedContext()
			const startNode = new NumberNode(5)
			const checkNode = new CheckPositiveNode()
			const addIfPositive = new AddNode(10)
			const addIfNegative = new AddNode(-20)
			const flow = new Flow(startNode)
			startNode.next(checkNode)
			checkNode.next(addIfPositive, 'positive')
			checkNode.next(addIfNegative, 'negative')
			await flow.run(ctx, globalRunOptions)
			expect(await ctx.get(CURRENT)).toBe(15)
		})

		it('should handle negative branching', async () => {
			const ctx = new TypedContext()
			const startNode = new NumberNode(-5)
			const checkNode = new CheckPositiveNode()
			const addIfPositive = new AddNode(10)
			const addIfNegative = new AddNode(-20)
			const flow = new Flow(startNode)
			startNode.next(checkNode)
			checkNode.next(addIfPositive, 'positive')
			checkNode.next(addIfNegative, 'negative')
			await flow.run(ctx, globalRunOptions)
			expect(await ctx.get(CURRENT)).toBe(-25)
		})

		it('should return the final action from the last node in a cycle', async () => {
			const ctx = new TypedContext()
			const startNode = new NumberNode(10)
			const checkNode = new CheckPositiveNode()
			const subtractNode = new AddNode(-3)
			const endNode = new SignalNode('cycle_done')
			const flow = new Flow(startNode)
			startNode.next(checkNode)
			checkNode.next(subtractNode, 'positive')
			checkNode.next(endNode, 'negative')
			subtractNode.next(checkNode)
			const lastAction = await flow.run(ctx, globalRunOptions)
			expect(await ctx.get(CURRENT)).toBe(-2)
			expect(lastAction).toBe('cycle_done')
		})
	})

	describe('composition', () => {
		it('should treat a flow as a node in another flow', async () => {
			const ctx = new TypedContext()
			const innerFlow = new Flow(new NumberNode(5))
			innerFlow.startNode!.next(new AddNode(10)).next(new MultiplyNode(2))
			const outerFlow = new Flow(innerFlow)
			await outerFlow.run(ctx, globalRunOptions)
			expect(await ctx.get(CURRENT)).toBe(30)
		})

		it('should propagate actions from inner flows for branching', async () => {
			const ctx = new TypedContext()
			const innerStart = new NumberNode(100)
			const innerEnd = new SignalNode('inner_done')
			innerStart.next(innerEnd)
			const innerFlow = new Flow(innerStart)
			const pathA = new PathNode('A')
			const pathB = new PathNode('B')
			const outerFlow = new Flow(innerFlow)
			innerFlow.next(pathA, 'other_action')
			innerFlow.next(pathB, 'inner_done')
			await outerFlow.run(ctx, globalRunOptions)
			expect(await ctx.get(CURRENT)).toBe(100)
			expect(await ctx.get(PATH_TAKEN)).toBe('B')
		})
	})

	describe('getNodeById', () => {
		it('should find a node by its ID in a linear flow', () => {
			const nodeA = new Node().withId('A')
			const nodeB = new Node().withId('B')
			const nodeC = new Node().withId('C')
			nodeA.next(nodeB).next(nodeC)
			const flow = new Flow(nodeA)

			const foundNode = flow.getNodeById('B')
			expect(foundNode).toBe(nodeB)
			expect(foundNode?.id).toBe('B')
		})

		it('should find a node in a complex graph with branches and cycles', () => {
			const start = new Node().withId('start')
			const decision = new Node().withId('decision')
			const pathA = new Node().withId('pathA')
			const pathB = new Node().withId('pathB')
			const converge = new Node().withId('converge')
			const final = new Node().withId('final')

			start.next(decision)
			decision.next(pathA, 'a')
			decision.next(pathB, 'b')
			pathA.next(converge)
			pathB.next(converge)
			converge.next(decision) // Cycle back
			converge.next(final, 'exit')

			const flow = new Flow(start)

			expect(flow.getNodeById('start')).toBe(start)
			expect(flow.getNodeById('pathB')).toBe(pathB)
			expect(flow.getNodeById('final')).toBe(final)
		})

		it('should return undefined if a node ID does not exist', () => {
			const nodeA = new Node().withId('A')
			const flow = new Flow(nodeA)
			expect(flow.getNodeById('non-existent')).toBeUndefined()
		})

		it('should return undefined for an empty flow', () => {
			const flow = new Flow()
			expect(flow.getNodeById('any-id')).toBeUndefined()
		})
	})

	describe('middleware', () => {
		it('should run a single middleware and complete the flow', async () => {
			const ctx = new TypedContext()
			const flow = new Flow(new AddNode(10)).withParams({ start: 5 })
			flow.use(async (args, next) => {
				const path = await args.ctx.get(MIDDLEWARE_PATH) ?? []
				args.ctx.set(MIDDLEWARE_PATH, [...path, 'mw-enter'])
				const result = await next(args)
				args.ctx.set(MIDDLEWARE_PATH, [...(await args.ctx.get(MIDDLEWARE_PATH)! || []), 'mw-exit'])
				return result
			})
			await flow.run(ctx, globalRunOptions)
			expect(await ctx.get(CURRENT)).toBe(10) // Node logic ran
			expect(await ctx.get(MIDDLEWARE_PATH)).toEqual(['mw-enter', 'mw-exit'])
		})

		it('should run multiple middlewares in the correct LIFO order', async () => {
			const ctx = new TypedContext()
			const flow = new Flow(new NumberNode(100))
			const createTracer = (id: string) => async (args: any, next: any) => {
				const path = await args.ctx.get(MIDDLEWARE_PATH) ?? []
				args.ctx.set(MIDDLEWARE_PATH, [...path, `enter-${id}`])
				const result = await next(args)
				const final_path = await args.ctx.get(MIDDLEWARE_PATH) ?? []
				args.ctx.set(MIDDLEWARE_PATH, [...final_path, `exit-${id}`])
				return result
			}
			flow.use(createTracer('mw1'))
			flow.use(createTracer('mw2'))
			await flow.run(ctx, globalRunOptions)
			expect(await ctx.get(MIDDLEWARE_PATH)).toEqual([
				'enter-mw1',
				'enter-mw2',
				'exit-mw2',
				'exit-mw1',
			])
		})

		it('should allow middleware to modify context before the node runs', async () => {
			const ctx = new TypedContext([[CURRENT, 0]])
			const node = new class extends Node<void, number> {
				async exec({ ctx }: any): Promise<number> {
					return await ctx.get(CURRENT) ?? -1
				}
			}().toContext(CURRENT)
			const flow = new Flow(node)
			flow.use(async (args, next) => {
				args.ctx.set(CURRENT, 50)
				return next(args)
			})
			await flow.run(ctx, globalRunOptions)
			expect(await ctx.get(CURRENT)).toBe(50)
		})

		it('should propagate errors from middleware and halt execution', async () => {
			const ctx = new TypedContext()
			const flow = new Flow(new NumberNode(1))
			const goodMiddleware = async (args: any, next: any) => {
				const path = await args.ctx.get(MIDDLEWARE_PATH) ?? []
				args.ctx.set(MIDDLEWARE_PATH, [...path, 'enter-good'])
				const res = await next(args)
				// This line should never be reached
				args.ctx.set(MIDDLEWARE_PATH, [...(await args.ctx.get(MIDDLEWARE_PATH) ?? []), 'exit-good'])
				return res
			}
			const badMiddleware = async () => {
				throw new Error('Middleware failure')
			}
			flow.use(goodMiddleware)
			flow.use(badMiddleware)
			await expect(flow.run(ctx, globalRunOptions)).rejects.toThrow('Middleware failure')
			expect(await ctx.get(MIDDLEWARE_PATH)).toEqual(['enter-good'])
			expect(await ctx.get(CURRENT)).toBeUndefined()
		})

		it('should allow middleware to short-circuit the flow', async () => {
			const ctx = new TypedContext([[CURRENT, 0]])
			const flow = new Flow(new AddNode(100))
			// This middleware decides not to proceed
			flow.use(async () => {
				return 'short-circuited'
			})
			const lastAction = await flow.run(ctx, globalRunOptions)
			expect(await ctx.get(CURRENT)).toBe(0)
			expect(lastAction).toBe('short-circuited')
		})
	})

	describe('cancellation', () => {
		class LongRunningNode extends Node<void, string> {
			constructor(public id: number, private delayMs: number) { super() }
			async exec({ ctx, signal }: any): Promise<string> {
				await ctx.set(`started_${this.id}`, true)
				await sleep(this.delayMs, signal)
				await ctx.set(`finished_${this.id}`, true)
				return `ok_${this.id}`
			}
		}

		class LongRunningNodeWithParams extends Node<void, string> {
			constructor(private delayMs: number) { super() }
			async exec({ ctx, params, signal }: any): Promise<string> {
				const id = params.id
				await ctx.set(`started_${id}`, true)
				await sleep(this.delayMs, signal)
				await ctx.set(`finished_${id}`, true)
				return `ok_${id}`
			}
		}

		it('should abort a linear flow and throw an AbortError', async () => {
			const ctx = new TypedContext()
			const n1 = new LongRunningNode(1, 15)
			const n2 = new LongRunningNode(2, 50)
			const flow = new Flow(n1)
			n1.next(n2)
			const controller = new AbortController()
			const runPromise = flow.run(ctx, { ...globalRunOptions, controller })
			setTimeout(() => controller.abort(), 30)
			await expect(runPromise).rejects.toThrow(AbortError)
			expect(await ctx.get('started_1')).toBe(true)
			expect(await ctx.get('started_2')).toBe(true)
			expect(await ctx.get('finished_1')).toBe(true)
			expect(await ctx.get('finished_2')).toBeUndefined()
		})

		it('should abort a sequential BatchFlow', async () => {
			const ctx = new TypedContext()
			class TestBatchFlow extends BatchFlow {
				protected nodeToRun: AbstractNode = new LongRunningNodeWithParams(20)
				async prep() { return [{ id: 1 }, { id: 2 }, { id: 3 }] }
			}
			const batchFlow = new TestBatchFlow()
			const controller = new AbortController()
			const runPromise = batchFlow.run(ctx, { ...globalRunOptions, controller })
			setTimeout(() => controller.abort(), 30) // Abort during the 2nd item's execution
			await expect(runPromise).rejects.toThrow(AbortError)
			expect(await ctx.get('started_1')).toBe(true)
			expect(await ctx.get('started_2')).toBe(true)
			expect(await ctx.get('finished_1')).toBe(true)
			expect(await ctx.get('finished_2')).toBeUndefined()
		})

		it('should abort a ParallelBatchFlow', async () => {
			const ctx = new TypedContext()
			class TestParallelFlow extends ParallelBatchFlow {
				protected nodeToRun: AbstractNode = new LongRunningNodeWithParams(50)
				async prep() { return [{ id: 1 }, { id: 2 }, { id: 3 }] }
			}
			const parallelFlow = new TestParallelFlow()
			const controller = new AbortController()
			const runPromise = parallelFlow.run(ctx, { ...globalRunOptions, controller })
			setTimeout(() => controller.abort(), 20) // Abort while all are running

			await expect(runPromise).rejects.toThrow()

			expect(await ctx.get('started_1')).toBe(true)
			expect(await ctx.get('started_2')).toBe(true)
			expect(await ctx.get('started_3')).toBe(true)

			expect(await ctx.get('finished_1')).toBeUndefined()
			expect(await ctx.get('finished_2')).toBeUndefined()
			expect(await ctx.get('finished_3')).toBeUndefined()
		})
	})

	describe('FatalWorkflowError handling', () => {
		class FatalNode extends Node {
			public attemptCount = 0
			public fallbackCalled = false

			constructor() { super({ maxRetries: 3 }) }

			async exec(args: any) {
				this.attemptCount++
				args.ctx.set(ATTEMPTS, this.attemptCount)
				throw new FatalWorkflowError(
					'Unrecoverable error',
					this.constructor.name,
					'exec',
				)
			}

			async execFallback() {
				this.fallbackCalled = true
				return 'fallback should not be returned'
			}
		}

		it('should halt the entire flow immediately without retries or fallbacks', async () => {
			const fatalNode = new FatalNode()
			const subsequentNode = new Node()
			fatalNode.next(subsequentNode)
			const flow = new Flow(fatalNode)
			const ctx = new TypedContext()

			const runPromise = flow.run(ctx, globalRunOptions)

			await expect(runPromise).rejects.toThrow(FatalWorkflowError)
			expect(await ctx.get(ATTEMPTS)).toBe(1)
			expect(fatalNode.fallbackCalled).toBe(false)
		})
	})
})

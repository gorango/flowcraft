import type { Logger, NodeArgs, NodeOptions, RunOptions } from './workflow.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	AbortError,
	BatchFlow,
	DEFAULT_ACTION,
	Flow,
	Node,
	ParallelBatchFlow,
	TypedContext,
	WorkflowError,
} from './workflow.js'

// Helper function for abortable sleep
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted)
			return reject(new AbortError())
		const timeoutId = setTimeout(resolve, ms)
		signal?.addEventListener('abort', () => {
			clearTimeout(timeoutId)
			reject(new AbortError())
		})
	})
}

// Mock logger for testing
function createMockLogger(): Logger {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}
}

let mockLogger = createMockLogger()
const runOptions: RunOptions = { logger: mockLogger }

afterEach(() => {
	mockLogger = createMockLogger()
	runOptions.logger = mockLogger
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
		const current = ctx.get<number>('current') ?? 0
		ctx.set('current', current + this.number)
	}
}
class MultiplyNode extends Node {
	constructor(private number: number) { super() }
	async prep({ ctx }: NodeArgs) {
		const current = ctx.get<number>('current') ?? 1
		ctx.set('current', current * this.number)
	}
}
class CheckPositiveNode extends Node<void, void, string> {
	async post({ ctx }: NodeArgs): Promise<string> {
		const current = ctx.get<number>('current')!
		return current >= 0 ? 'positive' : 'negative'
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
		const ctx = new TypedContext()
		const n1 = new NumberNode(5)
		const n2 = new AddNode(3)
		const n3 = new MultiplyNode(2)
		const flow = new Flow()
		flow.start(n1).next(n2).next(n3)
		const lastAction = await flow.run(ctx, runOptions)
		expect(ctx.get<number>('current')).toBe(16)
		expect(lastAction).toBe(DEFAULT_ACTION)
	})

	it('should create a linear pipeline with Flow.sequence', async () => {
		const ctx = new TypedContext()
		const flow = Flow.sequence(
			new NumberNode(5),
			new AddNode(3),
			new MultiplyNode(2),
		)
		const lastAction = await flow.run(ctx, runOptions)
		expect(ctx.get<number>('current')).toBe(16)
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
		await flow.run(ctx, runOptions)
		expect(ctx.get<number>('current')).toBe(15)
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
		await flow.run(ctx, runOptions)
		expect(ctx.get<number>('current')).toBe(-25)
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
		const lastAction = await flow.run(ctx, runOptions)
		expect(ctx.get<number>('current')).toBe(-2)
		expect(lastAction).toBe('cycle_done')
	})
})

describe('testFlowComposition', () => {
	it('should treat a flow as a node in another flow', async () => {
		const ctx = new TypedContext()
		const innerFlow = new Flow(new NumberNode(5))
		innerFlow.startNode!.next(new AddNode(10)).next(new MultiplyNode(2))
		const outerFlow = new Flow(innerFlow)
		await outerFlow.run(ctx, runOptions)
		expect(ctx.get<number>('current')).toBe(30)
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
		await outerFlow.run(ctx, runOptions)
		expect(ctx.get<number>('current')).toBe(100)
		expect(ctx.get<string>('path_taken')).toBe('B')
	})
})

describe('testExecFallback', () => {
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
			ctx.set('result', execRes)
			ctx.set('attempts', this.attemptCount)
		}
	}
	it('should call execFallback after all retries are exhausted', async () => {
		const ctx = new TypedContext()
		const node = new FallbackNode(true, { maxRetries: 3 })
		await node.run(ctx, runOptions)
		// 3 attempts total: 1 initial + 2 retries. The attemptCount logic is inside exec, so it will be 3.
		expect(ctx.get<number>('attempts')).toBe(3)
		expect(ctx.get<string>('result')).toBe('fallback')
	})
})

describe('testBatchProcessing', () => {
	it('should process items sequentially using BatchFlow', async () => {
		const ctx = new TypedContext([['input_data', { a: 1, b: 2, c: 3 }]])
		class DataProcessNode extends Node {
			async prep({ ctx, params }: NodeArgs) {
				const key = params.key
				const data = ctx.get<Record<string, number>>('input_data')![key]
				if (!ctx.has('results'))
					ctx.set('results', {})
				ctx.get<Record<string, number>>('results')![key] = data * 2
			}
		}
		class SimpleBatchFlow extends BatchFlow {
			async prep() { return [{ key: 'a' }, { key: 'b' }, { key: 'c' }] }
		}
		const flow = new SimpleBatchFlow(new DataProcessNode())
		await flow.run(ctx, runOptions)
		expect(ctx.get('results')).toEqual({ a: 2, b: 4, c: 6 })
	})

	it('should run a BatchFlow sequentially and respect async delays', async () => {
		const ctx = new TypedContext([['results', []]])
		class DelayedNode extends Node {
			async exec({ params }: NodeArgs) {
				await new Promise(res => setTimeout(res, 15))
				return params.val
			}

			async post({ ctx, execRes }: NodeArgs) {
				ctx.get<number[]>('results')!.push(execRes)
			}
		}
		class TestBatchFlow extends BatchFlow {
			async prep() { return [{ val: 1 }, { val: 2 }, { val: 3 }] }
		}
		const flow = new TestBatchFlow(new DelayedNode())
		const startTime = Date.now()
		await flow.run(ctx, runOptions)
		const duration = Date.now() - startTime
		expect(ctx.get('results')).toEqual([1, 2, 3])
		// 3 tasks of 15ms should take at least 45ms.
		expect(duration).toBeGreaterThanOrEqual(45)
	})
})

describe('testParallelProcessing', () => {
	it('should run a ParallelBatchFlow in parallel', async () => {
		const ctx = new TypedContext([
			['input_data', { a: 1, b: 2, c: 3 }],
			['results', {}],
		])
		class DataProcessNode extends Node<void, number> {
			async exec({ ctx, params }: NodeArgs<void, void>): Promise<number> {
				await new Promise(res => setTimeout(res, 15))
				const data = ctx.get<Record<string, number>>('input_data')![params.key]
				return data * params.multiplier
			}

			async post({ ctx, execRes, params }: NodeArgs<void, number>) {
				if (!ctx.has('results'))
					ctx.set('results', {})
				ctx.get<Record<string, number>>('results')![params.key] = execRes
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
		await flow.run(ctx, runOptions)
		const duration = Date.now() - startTime
		expect(ctx.get('results')).toEqual({ a: 2, b: 6, c: 12 })
		// 3 tasks of 15ms in parallel should take roughly 15ms, not 45ms.
		expect(duration).toBeLessThan(40)
	})

	it('should process items in parallel within a single Node.exec', async () => {
		class Processor extends Node<number[], number[]> {
			async prep({ ctx }: NodeArgs): Promise<number[]> {
				return ctx.get<number[]>('input')!
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

		const ctx = new TypedContext([['input', [1, 2, 3, 4]]])
		const node = new Processor()
		const startTime = Date.now()
		await node.run(ctx, runOptions)
		const duration = Date.now() - startTime
		expect(ctx.get('output')).toEqual([2, 4, 6, 8])
		// 4 tasks of 10ms in parallel should take ~10ms, not 40ms.
		expect(duration).toBeLessThan(35)
	})
})

describe('testAbortController', () => {
	class LongRunningNode extends Node<void, string> {
		constructor(private id: number, private delayMs: number) { super() }
		async exec({ ctx, signal }: NodeArgs): Promise<string> {
			const started = ctx.get<number[]>('started') ?? []
			ctx.set('started', started.concat(this.id))
			await sleep(this.delayMs, signal)
			const finished = ctx.get<number[]>('finished') ?? []
			ctx.set('finished', finished.concat(this.id))
			return `ok_${this.id}`
		}
	}

	class LongRunningNodeWithParams extends Node<void, string> {
		constructor(private delayMs: number) { super() }
		async exec({ ctx, params, signal }: NodeArgs): Promise<string> {
			const id = params.id
			const started = ctx.get<number[]>('started') ?? []
			ctx.set('started', started.concat(id))
			await sleep(this.delayMs, signal)
			const finished = ctx.get<number[]>('finished') ?? []
			ctx.set('finished', finished.concat(id))
			return `ok_${id}`
		}
	}

	it('should abort a linear flow and throw an AbortError', async () => {
		const ctx = new TypedContext()
		const n1 = new LongRunningNode(1, 15)
		const n2 = new LongRunningNode(2, 50)
		const n3 = new LongRunningNode(3, 15)

		const flow = new Flow()
		flow.start(n1).next(n2).next(n3)

		const controller = new AbortController()
		const runPromise = flow.run(ctx, { controller, logger: mockLogger })
		setTimeout(() => controller.abort(), 30) // Abort during n2's execution

		await expect(runPromise).rejects.toThrow(AbortError)
		expect(ctx.get('started')).toEqual([1, 2])
		expect(ctx.get('finished')).toEqual([1])
	})

	it('should abort a sequential BatchFlow', async () => {
		const ctx = new TypedContext()
		class TestBatchFlow extends BatchFlow {
			async prep() { return [{ id: 1 }, { id: 2 }, { id: 3 }] }
		}
		const batchFlow = new TestBatchFlow(new LongRunningNodeWithParams(20))
		const controller = new AbortController()
		const runPromise = batchFlow.run(ctx, { controller, logger: mockLogger })
		setTimeout(() => controller.abort(), 30) // Abort during the 2nd item's execution
		await expect(runPromise).rejects.toThrow(AbortError)
		expect(ctx.get('started')).toEqual([1, 2])
		expect(ctx.get('finished')).toEqual([1])
	})

	it('should abort a ParallelBatchFlow', async () => {
		const ctx = new TypedContext()
		class TestParallelFlow extends ParallelBatchFlow {
			async prep() { return [{ id: 1 }, { id: 2 }, { id: 3 }] }
		}
		const parallelFlow = new TestParallelFlow(new LongRunningNodeWithParams(50))
		const controller = new AbortController()
		const runPromise = parallelFlow.run(ctx, { controller, logger: mockLogger })
		setTimeout(() => controller.abort(), 20) // Abort while all are running
		await expect(runPromise).rejects.toThrow(AbortError)
		// All should have started in parallel
		expect(ctx.get('started')).toBeDefined()
		expect(ctx.get<number[]>('started')!.length).toBe(3)
		// None should have finished
		expect(ctx.get('finished')).toBeUndefined()
	})
})

describe('testLoggingAndErrors', () => {
	it('should use a default ConsoleLogger if none is provided', async () => {
		const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => { })
		const flow = new Flow(new NumberNode(1))
		await flow.run(new TypedContext())
		expect(consoleInfoSpy).toHaveBeenCalledWith(
			expect.stringContaining('[INFO] Running node: Flow'),
			expect.any(Object), // Expect a second argument for the context object
		)
		consoleInfoSpy.mockRestore()
	})

	it('should use the provided custom logger', async () => {
		const flow = new Flow(new NumberNode(1))
		await flow.run(new TypedContext(), runOptions)
		expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Running node: Flow'), expect.any(Object))
	})

	it('should log branching decisions', async () => {
		const checkNode = new CheckPositiveNode()
		const pathNode = new PathNode('A')
		const flow = new Flow(checkNode)
		checkNode.next(pathNode, 'positive')

		await flow.run(new TypedContext([['current', 10]]), runOptions)
		expect(mockLogger.debug).toHaveBeenCalledWith(
			`Action 'positive' from CheckPositiveNode leads to PathNode`,
			expect.any(Object),
		)
	})

	it('should log retry attempts and fallback execution', async () => {
		class FailingNode extends Node {
			constructor() {
				super({ maxRetries: 2, wait: 0 })
			}

			async exec() { throw new Error('fail') }
			async execFallback() { return 'fallback' }
		}

		const flow = new Flow(new FailingNode())
		await flow.run(new TypedContext(), runOptions)

		expect(mockLogger.warn).toHaveBeenCalledWith(
			'Attempt 1/2 failed for FailingNode. Retrying...',
			expect.any(Object),
		)
		expect(mockLogger.error).toHaveBeenCalledWith(
			'All retries failed for FailingNode. Executing fallback.',
			expect.any(Object),
		)
	})

	it('should wrap errors in WorkflowError with correct phase context', async () => {
		class FailingPrepNode extends Node {
			async prep() { throw new Error('Prep failed') }
		}
		const flow = new Flow(new FailingPrepNode())
		const runPromise = flow.run(new TypedContext(), runOptions)

		await expect(runPromise).rejects.toThrow(WorkflowError)
		await expect(runPromise).rejects.toMatchObject({
			name: 'WorkflowError',
			nodeName: 'FailingPrepNode',
			phase: 'prep',
			originalError: expect.any(Error),
		})
	})
})

import type { Logger, NodeArgs, NodeOptions, RunOptions } from './workflow'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BatchFlow, ParallelBatchFlow } from './builder/collection'
import { sleep } from './utils'
import {
	AbortError,
	contextKey,
	DEFAULT_ACTION,
	Flow,
	Node,
	TypedContext,
	WorkflowError,
} from './workflow'

const CURRENT = contextKey<number>('current')
const PATH_TAKEN = contextKey<string>('path_taken')
const STARTED = contextKey<number[]>('started')
const FINISHED = contextKey<number[]>('finished')
const RESULT = contextKey<string>('result')
const ATTEMPTS = contextKey<number>('attempts')

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
let runOptions: RunOptions = { logger: mockLogger }

afterEach(() => {
	mockLogger = createMockLogger()
	runOptions = { logger: mockLogger }
})

class NumberNode extends Node {
	constructor(private number: number) { super() }
	async prep({ ctx }: NodeArgs) {
		ctx.set(CURRENT, this.number)
	}
}
class AddNode extends Node {
	constructor(private number: number) { super() }
	async prep({ ctx }: NodeArgs) {
		const current = ctx.get(CURRENT) ?? 0
		ctx.set(CURRENT, current + this.number)
	}
}
class MultiplyNode extends Node {
	constructor(private number: number) { super() }
	async prep({ ctx }: NodeArgs) {
		const current = ctx.get(CURRENT) ?? 1
		ctx.set(CURRENT, current * this.number)
	}
}
class CheckPositiveNode extends Node<void, void, string> {
	async post({ ctx }: NodeArgs): Promise<string> {
		const current = ctx.get(CURRENT)!
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
	async prep({ ctx }: NodeArgs) {
		ctx.set(PATH_TAKEN, this.pathId)
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
		expect(ctx.get(CURRENT)).toBe(16)
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
		expect(ctx.get(CURRENT)).toBe(15)
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
		expect(ctx.get(CURRENT)).toBe(-25)
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
		expect(ctx.get(CURRENT)).toBe(-2)
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
		expect(ctx.get(CURRENT)).toBe(30)
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
		expect(ctx.get(CURRENT)).toBe(100)
		expect(ctx.get(PATH_TAKEN)).toBe('B')
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
			ctx.set(RESULT, execRes)
			ctx.set(ATTEMPTS, this.attemptCount)
		}
	}
	it('should call execFallback after all retries are exhausted', async () => {
		const ctx = new TypedContext()
		const node = new FallbackNode(true, { maxRetries: 3 })
		await node.run(ctx, runOptions)
		// 3 attempts total: 1 initial + 2 retries. The attemptCount logic is inside exec, so it will be 3.
		expect(ctx.get(ATTEMPTS)).toBe(3)
		expect(ctx.get(RESULT)).toBe('fallback')
	})
})

describe('testAbortController', () => {
	class LongRunningNode extends Node<void, string> {
		constructor(private id: number, private delayMs: number) { super() }
		async exec({ ctx, signal }: NodeArgs): Promise<string> {
			const started = ctx.get(STARTED) ?? []
			ctx.set(STARTED, started.concat(this.id))
			await sleep(this.delayMs, signal)
			const finished = ctx.get(FINISHED) ?? []
			ctx.set(FINISHED, finished.concat(this.id))
			return `ok_${this.id}`
		}
	}

	class LongRunningNodeWithParams extends Node<void, string> {
		constructor(private delayMs: number) { super() }
		async exec({ ctx, params, signal }: NodeArgs): Promise<string> {
			const id = params.id
			const started = ctx.get(STARTED) ?? []
			ctx.set(STARTED, started.concat(id))
			await sleep(this.delayMs, signal)
			const finished = ctx.get(FINISHED) ?? []
			ctx.set(FINISHED, finished.concat(id))
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
		expect(ctx.get(STARTED)).toEqual([1, 2])
		expect(ctx.get(FINISHED)).toEqual([1])
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
		expect(ctx.get(STARTED)).toEqual([1, 2])
		expect(ctx.get(FINISHED)).toEqual([1])
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
		expect(ctx.get(STARTED)).toBeDefined()
		expect(ctx.get(STARTED)!.length).toBe(3)
		// None should have finished
		expect(ctx.get(FINISHED)).toBeUndefined()
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

		await flow.run(new TypedContext([[CURRENT, 10]]), runOptions)
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

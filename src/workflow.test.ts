import type { AbstractNode, ContextKey, Logger, NodeArgs, NodeOptions, RunOptions } from './workflow'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BatchFlow, ParallelBatchFlow } from './builder/patterns'
import { sleep } from './utils/index'
import {
	AbortError,
	composeContext,
	contextKey,
	DEFAULT_ACTION,
	FILTER_FAILED,
	Flow,
	lens,
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
const NAME = contextKey<string>('name')
const COUNTER = contextKey<number>('counter')
const FINAL_RESULT = contextKey<string>('final_result')
const LENS_VALUE = contextKey<number>('lens_value')
const MIDDLEWARE_PATH = contextKey<string[]>('middleware_path')

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
class ValueNode<T> extends Node<void, T> {
	constructor(private value: T, options?: NodeOptions) { super(options) }
	async exec(): Promise<T> {
		return this.value
	}
}
class ReadContextNode<T> extends Node<void, T | undefined> {
	constructor(private key: ContextKey<T>) { super() }
	async exec({ ctx }: NodeArgs): Promise<T | undefined> {
		return ctx.get(this.key)
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

describe('testFlowGetNodeById', () => {
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

	it('should return undefined if a node ID does not exist', () => {
		const nodeA = new Node().withId('A')
		const flow = new Flow(nodeA)
		expect(flow.getNodeById('non-existent')).toBeUndefined()
	})

	it('should return undefined for an empty flow', () => {
		const flow = new Flow()
		expect(flow.getNodeById('any-id')).toBeUndefined()
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
		constructor(public id: number, private delayMs: number) { super() }
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
			protected nodeToRun: AbstractNode = new LongRunningNodeWithParams(20)
			async prep() { return [{ id: 1 }, { id: 2 }, { id: 3 }] }
		}
		const batchFlow = new TestBatchFlow()
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
			protected nodeToRun: AbstractNode = new LongRunningNodeWithParams(50)
			async prep() { return [{ id: 1 }, { id: 2 }, { id: 3 }] }
		}
		const parallelFlow = new TestParallelFlow()
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
	it('should be silent by default if no logger is provided', async () => {
		const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => { })
		const flow = new Flow(new NumberNode(1))
		await flow.run(new TypedContext())
		expect(consoleInfoSpy).not.toHaveBeenCalled()
		consoleInfoSpy.mockRestore()
	})

	it('should use the provided custom logger', async () => {
		const flow = new Flow(new NumberNode(1))
		await flow.run(new TypedContext(), runOptions)
		expect(mockLogger.info).toHaveBeenCalledWith(
			'Executor is running flow graph: Flow',
		)
		expect(mockLogger.info).toHaveBeenCalledWith(
			'Running node: NumberNode',
			expect.any(Object),
		)
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
			constructor() { super({ maxRetries: 2, wait: 0 }) }
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

describe('testContextUtilities', () => {
	it('lens should get and set values correctly', () => {
		const nameLens = lens(NAME)
		const ctx = new TypedContext()
		const setNameTransform = nameLens.set('Alice')
		setNameTransform(ctx)
		expect(nameLens.get(ctx)).toBe('Alice')
		expect(ctx.get(NAME)).toBe('Alice')
	})

	it('lens should update values based on the current value', () => {
		const counterLens = lens(COUNTER)
		const ctx = new TypedContext([[COUNTER, 5]])
		const incrementTransform = counterLens.update(current => (current ?? 0) + 1)
		incrementTransform(ctx)
		expect(counterLens.get(ctx)).toBe(6)
		// Test update on an undefined value
		const newCtx = new TypedContext()
		incrementTransform(newCtx)
		expect(counterLens.get(newCtx)).toBe(1)
	})

	it('composeContext should apply multiple transformations in order', () => {
		const nameLens = lens(NAME)
		const counterLens = lens(COUNTER)
		const ctx = new TypedContext([[COUNTER, 10]])
		const composedTransform = composeContext(
			nameLens.set('Bob'),
			counterLens.update(c => (c ?? 0) * 2),
		)
		composedTransform(ctx)
		expect(nameLens.get(ctx)).toBe('Bob')
		expect(counterLens.get(ctx)).toBe(20)
	})
})

describe('testFunctionalMethods', () => {
	it('map() should transform the execution result', async () => {
		const node = new ValueNode({ value: 10 }).map(res => `Value is ${res.value}`)
		const resultNode = node.toContext(FINAL_RESULT) // Use toContext to easily inspect the result
		const ctx = new TypedContext()
		await resultNode.run(ctx, runOptions)
		expect(ctx.get(FINAL_RESULT)).toBe('Value is 10')
	})

	it('map() should handle async transformations', async () => {
		const node = new ValueNode('hello').map(async (res) => {
			await sleep(1)
			return res.toUpperCase()
		})
		const resultNode = node.toContext(FINAL_RESULT)
		const ctx = new TypedContext()
		await resultNode.run(ctx, runOptions)
		expect(ctx.get(FINAL_RESULT)).toBe('HELLO')
	})

	it('toContext() should set the execution result in the context', async () => {
		const node = new ValueNode('success').toContext(FINAL_RESULT)
		const ctx = new TypedContext()
		await node.run(ctx, runOptions)
		expect(ctx.get(FINAL_RESULT)).toBe('success')
	})

	it('tap() should perform a side effect without altering the result', async () => {
		const sideEffect = vi.fn()
		const node = new ValueNode(42)
			.tap(sideEffect)
			.map(res => res + 1)
			.toContext(COUNTER)
		const ctx = new TypedContext()
		await node.run(ctx, runOptions)
		expect(sideEffect).toHaveBeenCalledWith(42)
		expect(ctx.get(COUNTER)).toBe(43)
	})

	it('filter() should route to DEFAULT_ACTION when predicate is true', async () => {
		const node = new ValueNode(100).filter(res => res > 50)
		const action = await node.run(new TypedContext(), runOptions)
		expect(action).toBe(DEFAULT_ACTION)
	})

	it('filter() should route to FILTER_FAILED when predicate is false', async () => {
		const node = new ValueNode(10).filter(res => res > 50)
		const action = await node.run(new TypedContext(), runOptions)
		expect(action).toBe(FILTER_FAILED)
	})

	it('withLens() should modify context before execution', async () => {
		const valueLens = lens(LENS_VALUE)
		// This node reads the value that withLens should have set
		const node = new ReadContextNode(LENS_VALUE)
			.withLens(valueLens, 99)
			.map(res => (res ?? -1) + 1)
			.toContext(COUNTER)
		const ctx = new TypedContext()
		await node.run(ctx, runOptions)
		expect(ctx.get(COUNTER)).toBe(100)
	})

	it('should allow chaining of multiple functional methods', async () => {
		const sideEffect = vi.fn()
		const valueLens = lens(LENS_VALUE)
		// Create a node that reads from the context after a lens sets it,
		// taps the value, maps it, filters it, and stores the final result.
		const node = new ReadContextNode(LENS_VALUE)
			.withLens(valueLens, 50) // 1. Set LENS_VALUE to 50
			.tap(sideEffect) // 2. Side effect with the value (50)
			.map(val => `The number is ${val}`) // 3. Transform to "The number is 50"
			.filter(str => str.includes('50')) // 4. Predicate passes
			.toContext(FINAL_RESULT) // 5. Store "The number is 50" in FINAL_RESULT
		const ctx = new TypedContext()
		const action = await node.run(ctx, runOptions)
		expect(sideEffect).toHaveBeenCalledWith(50)
		expect(ctx.get(FINAL_RESULT)).toBe('The number is 50')
		expect(action).toBe(DEFAULT_ACTION)
		// Test the filter failing
		const failingNode = new ReadContextNode(LENS_VALUE)
			.withLens(valueLens, 99)
			.filter(val => val! < 90)
		const failingAction = await failingNode.run(new TypedContext(), runOptions)
		expect(failingAction).toBe(FILTER_FAILED)
	})
})

describe('testFlowMiddleware', () => {
	it('should run a single middleware and complete the flow', async () => {
		const ctx = new TypedContext()
		const flow = new Flow(new AddNode(10)).withParams({ start: 5 })
		flow.use(async (args, next) => {
			const path = args.ctx.get(MIDDLEWARE_PATH) ?? []
			args.ctx.set(MIDDLEWARE_PATH, [...path, 'mw-enter'])
			const result = await next(args)
			args.ctx.set(MIDDLEWARE_PATH, [...args.ctx.get(MIDDLEWARE_PATH)!, 'mw-exit'])
			return result
		})
		await flow.run(ctx, runOptions)
		expect(ctx.get(CURRENT)).toBe(10) // Node logic ran
		expect(ctx.get(MIDDLEWARE_PATH)).toEqual(['mw-enter', 'mw-exit'])
	})

	it('should run multiple middlewares in the correct LIFO order', async () => {
		const ctx = new TypedContext()
		const flow = new Flow(new NumberNode(100))
		const createTracer = (id: string) => async (args: NodeArgs, next: any) => {
			const path = args.ctx.get(MIDDLEWARE_PATH) ?? []
			args.ctx.set(MIDDLEWARE_PATH, [...path, `enter-${id}`])
			const result = await next(args)
			const final_path = args.ctx.get(MIDDLEWARE_PATH) ?? []
			args.ctx.set(MIDDLEWARE_PATH, [...final_path, `exit-${id}`])
			return result
		}
		flow.use(createTracer('mw1'))
		flow.use(createTracer('mw2'))
		await flow.run(ctx, runOptions)
		expect(ctx.get(MIDDLEWARE_PATH)).toEqual([
			'enter-mw1',
			'enter-mw2',
			'exit-mw2',
			'exit-mw1',
		])
	})

	it('should allow middleware to modify context before the node runs', async () => {
		const ctx = new TypedContext([[CURRENT, 0]])
		const node = new class extends Node<void, number> {
			async exec({ ctx }: NodeArgs): Promise<number> {
				return ctx.get(CURRENT) ?? -1
			}
		}().toContext(CURRENT)
		const flow = new Flow(node)
		flow.use(async (args, next) => {
			args.ctx.set(CURRENT, 50)
			return next(args)
		})
		await flow.run(ctx, runOptions)
		expect(ctx.get(CURRENT)).toBe(50)
	})

	it('should propagate errors from middleware and halt execution', async () => {
		const ctx = new TypedContext()
		const flow = new Flow(new NumberNode(1))
		const goodMiddleware = async (args: NodeArgs, next: any) => {
			const path = args.ctx.get(MIDDLEWARE_PATH) ?? []
			args.ctx.set(MIDDLEWARE_PATH, [...path, 'enter-good'])
			const res = await next(args)
			// This line should never be reached
			args.ctx.set(MIDDLEWARE_PATH, [...(args.ctx.get(MIDDLEWARE_PATH) ?? []), 'exit-good'])
			return res
		}
		const badMiddleware = async () => {
			throw new Error('Middleware failure')
		}
		flow.use(goodMiddleware)
		flow.use(badMiddleware)
		await expect(flow.run(ctx, runOptions)).rejects.toThrow('Middleware failure')
		expect(ctx.get(MIDDLEWARE_PATH)).toEqual(['enter-good'])
		expect(ctx.get(CURRENT)).toBeUndefined()
	})

	it('should allow middleware to short-circuit the flow', async () => {
		const ctx = new TypedContext([[CURRENT, 0]])
		const flow = new Flow(new AddNode(100))
		// This middleware decides not to proceed
		flow.use(async (args, next) => {
			const shouldProceed = false
			if (shouldProceed) {
				return next(args)
			}
			return 'short-circuited'
		})
		const lastAction = await flow.run(ctx, runOptions)
		expect(ctx.get(CURRENT)).toBe(0)
		expect(lastAction).toBe('short-circuited')
	})
})

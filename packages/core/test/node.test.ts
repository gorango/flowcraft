import { describe, expect, it } from 'vitest'
import { AsyncContextView } from '../src/context'
import { BaseNode, isNodeClass } from '../src/node'
import { ExecutionContext } from '../src/runtime/execution-context'
import { WorkflowState } from '../src/runtime/state'
import type { ISyncContext, NodeContext, NodeResult } from '../src/types'

class TestNodeForIsNodeClass extends BaseNode {
	async exec(_prepResult: any, _context: NodeContext): Promise<Omit<NodeResult, 'error'>> {
		return { output: 'test' }
	}
}

class MockSyncContext implements ISyncContext {
	readonly type = 'sync' as const
	private data = new Map<string, any>()

	get<K extends string | number>(key: K): any {
		return this.data.get(String(key))
	}

	set<K extends string | number>(key: K, value: any): void {
		this.data.set(String(key), value)
	}

	has(key: string | number): boolean {
		return this.data.has(String(key))
	}

	delete(key: string | number): boolean {
		return this.data.delete(String(key))
	}

	toJSON(): Record<string, any> {
		return Object.fromEntries(this.data)
	}
}

describe('BaseNode', () => {
	const mockRuntime = {} as any
	const mockWorkflowState = new WorkflowState({})
	const mockExecutionContext = new ExecutionContext({} as any, mockWorkflowState, new Map(), 'test-id', mockRuntime, {
		logger: {} as any,
		eventBus: {} as any,
		serializer: {} as any,
		evaluator: {} as any,
		middleware: [],
		dependencies: {} as any,
	})

	class TestNode extends BaseNode {
		prepCalled = false
		execCalled = false
		postCalled = false
		fallbackCalled = false

		async prep(_context: NodeContext) {
			this.prepCalled = true
			return 'prepResult'
		}

		async exec(_prepResult: any, _context: NodeContext): Promise<Omit<NodeResult, 'error'>> {
			this.execCalled = true
			return { output: 'execResult' }
		}

		async post(_execResult: Omit<NodeResult, 'error'>, _context: NodeContext): Promise<NodeResult> {
			this.postCalled = true
			return _execResult
		}

		async fallback(_error: Error, _context: NodeContext): Promise<Omit<NodeResult, 'error'>> {
			this.fallbackCalled = true
			return { output: 'fallbackResult' }
		}
	}

	class FailingPrepNode extends BaseNode {
		postCalled = false

		async prep(_context: NodeContext) {
			throw new Error('Prep failed')
		}

		async exec(_prepResult: any, _context: NodeContext): Promise<Omit<NodeResult, 'error'>> {
			return { output: 'exec' }
		}

		async post(_execResult: Omit<NodeResult, 'error'>, _context: NodeContext): Promise<NodeResult> {
			this.postCalled = true
			throw new Error('Should not be called')
		}
	}

	class FailingExecNode extends BaseNode {
		postCalled = false

		async prep(_context: NodeContext) {
			return 'prep'
		}

		async exec(_prepResult: any, _context: NodeContext): Promise<Omit<NodeResult, 'error'>> {
			throw new Error('Exec failed')
		}

		async post(_execResult: Omit<NodeResult, 'error'>, _context: NodeContext): Promise<NodeResult> {
			this.postCalled = true
			throw new Error('Should not be called')
		}
	}

	class FailingExecWithFallbackNode extends BaseNode {
		fallbackCalled = false

		async prep(_context: NodeContext) {
			return 'prep'
		}

		async exec(_prepResult: any, _context: NodeContext): Promise<Omit<NodeResult, 'error'>> {
			throw new Error('Exec failed')
		}

		async post(_execResult: Omit<NodeResult, 'error'>, _context: NodeContext): Promise<NodeResult> {
			return _execResult
		}

		async fallback(_error: Error, _context: NodeContext): Promise<Omit<NodeResult, 'error'>> {
			this.fallbackCalled = true
			return { output: 'fallback' }
		}
	}

	it('should call prep, exec, and post in the correct order on success', async () => {
		const node = new TestNode({})
		const syncContext = new MockSyncContext()
		const asyncContext = new AsyncContextView(syncContext)
		const context: NodeContext = {
			context: asyncContext,
			input: {},
			params: {},
			dependencies: {
				runtime: mockExecutionContext,
				workflowState: mockWorkflowState,
			},
		}
		const prepResult = await node.prep(context)
		await node.exec(prepResult, context)
		await node.post({ output: 'test' }, context)
		expect(node.prepCalled).toBe(true)
		expect(node.execCalled).toBe(true)
		expect(node.postCalled).toBe(true)
	})

	it('should not call post if prep fails', async () => {
		const node = new FailingPrepNode({})
		const syncContext = new MockSyncContext()
		const asyncContext = new AsyncContextView(syncContext)
		const context: NodeContext = {
			context: asyncContext,
			input: {},
			params: {},
			dependencies: {
				runtime: mockExecutionContext,
				workflowState: mockWorkflowState,
			},
		}
		await expect(node.prep(context)).rejects.toThrow('Prep failed')
		expect(node.postCalled).toBe(false)
	})

	it('should not call post if exec fails and there is no fallback', async () => {
		const node = new FailingExecNode({})
		const syncContext = new MockSyncContext()
		const asyncContext = new AsyncContextView(syncContext)
		const context: NodeContext = {
			context: asyncContext,
			input: {},
			params: {},
			dependencies: {
				runtime: mockExecutionContext,
				workflowState: mockWorkflowState,
			},
		}
		const prepResult = await node.prep(context)
		await expect(node.exec(prepResult, context)).rejects.toThrow('Exec failed')
		expect(node.postCalled).toBe(false)
	})

	it('should call post with the fallback result if exec fails and fallback succeeds', async () => {
		const node = new FailingExecWithFallbackNode({})
		const syncContext = new MockSyncContext()
		const asyncContext = new AsyncContextView(syncContext)
		const context: NodeContext = {
			context: asyncContext,
			input: {},
			params: {},
			dependencies: {
				runtime: mockExecutionContext,
				workflowState: mockWorkflowState,
			},
		}
		const prepResult = await node.prep(context)
		await expect(node.exec(prepResult, context)).rejects.toThrow('Exec failed')
		await node.fallback(new Error('Exec failed'), context)
		const postResult = await node.post({ output: 'fallback' }, context)
		expect(node.fallbackCalled).toBe(true)
		expect(postResult.output).toBe('fallback')
	})

	it('should re-throw the original error if the default fallback is used', async () => {
		const node = new FailingExecNode({})
		const syncContext = new MockSyncContext()
		const asyncContext = new AsyncContextView(syncContext)
		const context: NodeContext = {
			context: asyncContext,
			input: {},
			params: {},
			dependencies: {
				runtime: mockExecutionContext,
				workflowState: mockWorkflowState,
			},
		}
		const prepResult = await node.prep(context)
		await expect(node.exec(prepResult, context)).rejects.toThrow('Exec failed')
		await expect(node.fallback(new Error('Exec failed'), context)).rejects.toThrow('Exec failed')
	})

	it('should call constructor with params', () => {
		const params = { key: 'value' }
		const node = new TestNode(params)
		expect((node as any).params).toEqual(params)
	})

	it('should call constructor without params', () => {
		const node = new TestNode()
		expect((node as any).params).toBeUndefined()
	})
})

describe('isNodeClass', () => {
	it('should return true for a class with prototype.exec', () => {
		expect(isNodeClass(TestNodeForIsNodeClass)).toBe(true)
	})

	it('should return false for a function without prototype.exec', () => {
		const func = () => {}
		expect(isNodeClass(func)).toBe(false)
	})

	it('should return false for a class without prototype.exec', () => {
		class NoExecNode {
			// No exec method
		}
		expect(isNodeClass(NoExecNode)).toBe(false)
	})

	it('should return false for non-function', () => {
		expect(isNodeClass('string')).toBe(false)
		expect(isNodeClass(123)).toBe(false)
		expect(isNodeClass({})).toBe(false)
	})
})

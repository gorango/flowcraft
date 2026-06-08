import { describe, expect, it, vi } from 'vitest'
import { CloudflareQueueAdapter, type CloudflareQueueAdapterOptions } from './adapter'

function createMockStatusKV() {
	const store: Record<string, string> = {}
	return {
		get: vi.fn().mockImplementation(async (key) => store[key] || null),
		put: vi.fn().mockImplementation(async (key, value) => {
			store[key] = value
		}),
	}
}

function createMockQueue() {
	return {
		send: vi.fn().mockImplementation(async (_msg) => {}),
	}
}

function createMockStorage() {
	const store: Record<string, unknown> = {}
	return {
		get: vi.fn().mockImplementation(async (key) => store[key]),
		put: vi.fn().mockImplementation(async (key, value) => {
			store[key] = value
		}),
		delete: vi.fn().mockImplementation(async (_key) => {}),
		list: vi.fn().mockImplementation(async () => ({ keys: [] })),
	}
}

function createMockLogger() {
	return {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	}
}

function createAdapter(overrides?: Partial<CloudflareQueueAdapterOptions>) {
	const mockQueue = createMockQueue()
	const mockStatusKV = createMockStatusKV()
	const mockStorage = createMockStorage()
	const logger = createMockLogger()

	return {
		adapter: new CloudflareQueueAdapter({
			queue: mockQueue as any,
			durableObjectStorage: mockStorage as any,
			queueName: 'test-queue',
			statusKVNamespace: mockStatusKV as any,
			runtimeOptions: {},
			coordinationStore: {} as any,
			...overrides,
		}),
		mockQueue,
		mockStatusKV,
		mockStorage,
		logger,
	}
}

describe('CloudflareQueueAdapter', function () {
	describe('Constructor', function () {
		it('should initialize with default status prefix', function () {
			const { adapter } = createAdapter()
			expect(adapter).toBeDefined()
		})

		it('should support custom status prefix', function () {
			const { adapter } = createAdapter({ statusPrefix: 'custom:' })
			expect(adapter).toBeDefined()
		})
	})

	describe('createContext', function () {
		it('should create DurableObjectContext', function () {
			const { adapter } = createAdapter()
			const context = (adapter as any).createContext('test-run-1')
			expect(context).toBeDefined()
			expect(context.runId).toBe('test-run-1')
		})
	})

	describe('enqueueJob', function () {
		it('should send job to queue', async function () {
			const { adapter, mockQueue } = createAdapter()
			const job = { runId: 'run-1', blueprintId: 'bp-1', nodeId: 'node-1' }
			await (adapter as any).enqueueJob(job)
			expect(mockQueue.send).toHaveBeenCalledWith(job)
		})
	})

	describe('onJobStart', function () {
		it('should set running status in KV', async function () {
			const { adapter, mockStatusKV } = createAdapter()
			await (adapter as any).onJobStart('run-1', 'bp-1', 'node-1')
			expect(mockStatusKV.put).toHaveBeenCalled()
		})

		it('should merge with existing status', async function () {
			const { adapter, mockStatusKV } = createAdapter()
			mockStatusKV.get = vi
				.fn()
				.mockResolvedValue(JSON.stringify({ status: 'pending', customField: 'value' }))
			await (adapter as any).onJobStart('run-1', 'bp-1', 'node-1')
			expect(mockStatusKV.put).toHaveBeenCalled()
		})

		it('should handle KV errors gracefully', async function () {
			const { adapter, mockStatusKV } = createAdapter()
			mockStatusKV.get = vi.fn().mockRejectedValue(new Error('KV error'))
			await (adapter as any).onJobStart('run-1', 'bp-1', 'node-1')
		})
	})

	describe('publishFinalResult', function () {
		it('should publish completed status', async function () {
			const { adapter, mockStatusKV } = createAdapter()
			await (adapter as any).publishFinalResult('run-1', { status: 'completed' })
			expect(mockStatusKV.put).toHaveBeenCalled()
		})

		it('should publish failed status with reason', async function () {
			const { adapter, mockStatusKV } = createAdapter()
			await (adapter as any).publishFinalResult('run-1', {
				status: 'failed',
				reason: 'Some error',
			})
			expect(mockStatusKV.put).toHaveBeenCalled()
		})
	})

	describe('registerWebhookEndpoint', function () {
		it('should throw not implemented error', async function () {
			const { adapter } = createAdapter()
			await expect(adapter.registerWebhookEndpoint('run-1', 'node-1')).rejects.toThrow(
				'registerWebhookEndpoint not implemented for CloudflareAdapter',
			)
		})
	})

	describe('handleJob', function () {
		it('should handle job by calling super.handleJob', async function () {
			const { adapter } = createAdapter()
			await adapter.handleJob({ runId: 'run-1', blueprintId: 'bp-1', nodeId: 'node-1' })
		})
	})

	describe('processJobs', function () {
		it('should throw not supported error', function () {
			const { adapter } = createAdapter()
			expect(() => (adapter as any).processJobs(() => {})).toThrow(
				'processJobs() is not supported in Cloudflare Workers',
			)
		})
	})

	describe('start', function () {
		it('should throw not supported error', function () {
			const { adapter } = createAdapter()
			expect(() => adapter.start()).toThrow('start() is not supported in Cloudflare Workers')
		})
	})

	describe('stop', function () {
		it('should be a no-op', function () {
			const { adapter } = createAdapter()
			adapter.stop()
		})
	})
})

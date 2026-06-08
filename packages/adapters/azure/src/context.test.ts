import type { PatchOperation } from 'flowcraft'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CosmosDbContext } from './context'

interface MockItemResponse {
	resource?: Record<string, any>
}

function createMockItem(readValue: MockItemResponse = {}) {
	return {
		read: vi.fn().mockResolvedValue(readValue),
		replace: vi.fn().mockResolvedValue({}),
		patch: vi.fn().mockResolvedValue({}),
	}
}

function createMockContainer(itemResponse: MockItemResponse = {}) {
	const mockItem = createMockItem(itemResponse)
	return {
		item: vi.fn().mockReturnValue(mockItem),
		items: {
			upsert: vi.fn().mockResolvedValue({}),
			query: vi.fn().mockReturnValue({
				fetchAll: vi.fn().mockResolvedValue({ resources: [] }),
			}),
		},
	}
}

function createMockClient(itemResponse?: MockItemResponse) {
	const container = createMockContainer(itemResponse)
	return {
		database: vi.fn().mockReturnValue({
			container: vi.fn().mockReturnValue(container),
			containers: {
				createIfNotExists: vi.fn().mockResolvedValue({}),
			},
		}),
	}
}

describe('CosmosDbContext - Unit Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('should create a context with runId', () => {
		const mockClient = createMockClient()
		const context = new CosmosDbContext('run-123', {
			client: mockClient as any,
			databaseName: 'test-db',
			containerName: 'test-container',
		})

		expect(context.type).toBe('async')
	})

	it('should get a value from context', async () => {
		const mockClient = createMockClient({
			resource: { id: 'run-1', runId: 'run-1', key1: 'value1' },
		})
		const context = new CosmosDbContext('run-1', {
			client: mockClient as any,
			databaseName: 'test-db',
			containerName: 'test-container',
		})

		const result = await context.get('key1')
		expect(result).toBe('value1')
	})

	it('should return undefined when key does not exist', async () => {
		const mockClient = createMockClient({
			resource: { id: 'run-1', runId: 'run-1', key1: 'value1' },
		})
		const context = new CosmosDbContext('run-1', {
			client: mockClient as any,
			databaseName: 'test-db',
			containerName: 'test-container',
		})

		const result = await context.get('nonexistent')
		expect(result).toBeUndefined()
	})

	it('should return undefined when item does not exist', async () => {
		const mockContainerItem = {
			read: vi.fn().mockRejectedValue({ code: 404 }),
			replace: vi.fn().mockResolvedValue({}),
			patch: vi.fn().mockResolvedValue({}),
		}
		const mockContainer = {
			item: vi.fn().mockReturnValue(mockContainerItem),
			items: {
				upsert: vi.fn().mockResolvedValue({}),
				query: vi.fn().mockReturnValue({
					fetchAll: vi.fn().mockResolvedValue({ resources: [] }),
				}),
			},
		}
		const mockClient = {
			database: vi.fn().mockReturnValue({
				container: vi.fn().mockReturnValue(mockContainer),
			}),
		}

		const context = new CosmosDbContext('run-1', {
			client: mockClient as any,
			databaseName: 'test-db',
			containerName: 'test-container',
		})

		const result = await context.get('key1')
		expect(result).toBeUndefined()
	})

	it('should set a value in context', async () => {
		const mockClient = createMockClient()
		const context = new CosmosDbContext('run-123', {
			client: mockClient as any,
			databaseName: 'test-db',
			containerName: 'test-container',
		})

		await expect(context.set('newKey', 'newValue')).resolves.not.toThrow()
	})

	it('should check if a key exists', async () => {
		const mockClient = createMockClient({
			resource: { id: 'run-1', runId: 'run-1', key1: 'value1' },
		})
		const context = new CosmosDbContext('run-1', {
			client: mockClient as any,
			databaseName: 'test-db',
			containerName: 'test-container',
		})

		const hasKey = await context.has('key1')
		expect(hasKey).toBe(true)
	})

	it('should return false when key does not exist in has check', async () => {
		const mockClient = createMockClient({
			resource: { id: 'run-1', runId: 'run-1', key1: 'value1' },
		})
		const context = new CosmosDbContext('run-1', {
			client: mockClient as any,
			databaseName: 'test-db',
			containerName: 'test-container',
		})

		const hasKey = await context.has('nonexistent')
		expect(hasKey).toBe(false)
	})

	it('should delete a key from context', async () => {
		const mockPatch = vi.fn().mockResolvedValue({})
		const mockContainer = {
			item: vi.fn().mockReturnValue({
				read: vi.fn().mockResolvedValue({ resource: { id: 'run-123' } }),
				patch: mockPatch,
			}),
			items: {
				upsert: vi.fn().mockResolvedValue({}),
			},
		}
		const mockClient = {
			database: vi.fn().mockReturnValue({
				container: vi.fn().mockReturnValue(mockContainer),
			}),
		}
		const context = new CosmosDbContext('run-123', {
			client: mockClient as any,
			databaseName: 'test-db',
			containerName: 'test-container',
		})

		await expect(context.delete('key1')).resolves.toBe(true)
		expect(mockPatch).toHaveBeenCalled()
	})

	it('should handle delete error with 400 code', async () => {
		const mockPatch = vi.fn().mockRejectedValue({ code: 400 })
		const mockContainer = {
			item: vi.fn().mockReturnValue({
				read: vi.fn().mockResolvedValue({ resource: { id: 'run-123' } }),
				patch: mockPatch,
			}),
			items: {
				upsert: vi.fn().mockResolvedValue({}),
			},
		}
		const mockClient = {
			database: vi.fn().mockReturnValue({
				container: vi.fn().mockReturnValue(mockContainer),
			}),
		}
		const context = new CosmosDbContext('run-123', {
			client: mockClient as any,
			databaseName: 'test-db',
			containerName: 'test-container',
		})

		const result = await context.delete('nonexistent')
		expect(result).toBe(false)
	})

	it('should convert context to JSON', async () => {
		const mockClient = createMockClient({
			resource: { id: 'run-1', runId: 'run-1', key1: 'value1', _etag: 'abc' },
		})
		const context = new CosmosDbContext('run-1', {
			client: mockClient as any,
			databaseName: 'test-db',
			containerName: 'test-container',
		})

		const json = await context.toJSON()
		expect(json).toBeDefined()
		expect(json.key1).toBe('value1')
	})

	it('should return empty object when item not found', async () => {
		const mockContainerItem = {
			read: vi.fn().mockRejectedValue({ code: 404 }),
			replace: vi.fn().mockResolvedValue({}),
			patch: vi.fn().mockResolvedValue({}),
		}
		const mockContainer = {
			item: vi.fn().mockReturnValue(mockContainerItem),
			items: {
				upsert: vi.fn().mockResolvedValue({}),
				query: vi.fn().mockReturnValue({
					fetchAll: vi.fn().mockResolvedValue({ resources: [] }),
				}),
			},
		}
		const mockClient = {
			database: vi.fn().mockReturnValue({
				container: vi.fn().mockReturnValue(mockContainer),
			}),
		}
		const context = new CosmosDbContext('run-123', {
			client: mockClient as any,
			databaseName: 'test-db',
			containerName: 'test-container',
		})

		const json = await context.toJSON()
		expect(json).toEqual({})
	})

	it('should patch multiple set operations', async () => {
		const mockClient = createMockClient()
		const context = new CosmosDbContext('run-123', {
			client: mockClient as any,
			databaseName: 'test-db',
			containerName: 'test-container',
		})

		const operations: PatchOperation[] = [
			{ op: 'set', key: 'user', value: { id: 1, name: 'Alice' } },
			{ op: 'set', key: 'count', value: 10 },
			{ op: 'set', key: 'status', value: 'completed' },
		]

		await expect(context.patch(operations)).resolves.not.toThrow()
	})

	it('should patch with delete operation', async () => {
		const mockClient = createMockClient()
		const context = new CosmosDbContext('run-123', {
			client: mockClient as any,
			databaseName: 'test-db',
			containerName: 'test-container',
		})

		const operations: PatchOperation[] = [{ op: 'delete', key: 'items' }]

		await expect(context.patch(operations)).resolves.not.toThrow()
	})

	it('should not patch when operations array is empty', async () => {
		const mockClient = createMockClient()
		const context = new CosmosDbContext('run-123', {
			client: mockClient as any,
			databaseName: 'test-db',
			containerName: 'test-container',
		})

		const operations: PatchOperation[] = []

		await expect(context.patch(operations)).resolves.not.toThrow()
	})
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DynamoDbCoordinationStore } from './store'

function createMockDynamo() {
	return {
		send: vi.fn().mockResolvedValue({
			Attributes: { value: { N: '5' } },
		}),
	}
}

describe('DynamoDbCoordinationStore - Unit Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('should increment a key', async () => {
		const mockDynamo = createMockDynamo() as any
		const store = new DynamoDbCoordinationStore({ client: mockDynamo, tableName: 'test' })

		const result = await store.increment('test-key', 60)

		expect(result).toBe(5)
	})

	it('should set a value if key does not exist', async () => {
		const mockDynamo = {
			send: vi.fn().mockResolvedValue({}),
		} as any
		const store = new DynamoDbCoordinationStore({ client: mockDynamo, tableName: 'test' })

		const result = await store.setIfNotExist('test-key', 'test-value', 60)

		expect(result).toBe(true)
	})

	it('should return false when key already exists', async () => {
		const error = new Error('ConditionalCheckFailed')
		error.name = 'ConditionalCheckFailedException'
		const mockDynamo = {
			send: vi.fn().mockRejectedValue(error),
		} as any
		const store = new DynamoDbCoordinationStore({ client: mockDynamo, tableName: 'test' })

		const result = await store.setIfNotExist('test-key', 'test-value', 60)

		expect(result).toBe(false)
	})

	it('should delete a key', async () => {
		const mockDynamo = {
			send: vi.fn().mockResolvedValue({}),
		} as any
		const store = new DynamoDbCoordinationStore({ client: mockDynamo, tableName: 'test' })

		await store.delete('test-key')

		expect(mockDynamo.send).toHaveBeenCalled()
	})

	it('should extend TTL of a key', async () => {
		const mockDynamo = {
			send: vi.fn().mockResolvedValue({ Attributes: {} }),
		} as any
		const store = new DynamoDbCoordinationStore({ client: mockDynamo, tableName: 'test' })

		const result = await store.extendTTL('test-key', 120)

		expect(result).toBe(true)
	})

	it('should return false when key does not exist for extendTTL', async () => {
		const error = new Error('ConditionalCheckFailed')
		error.name = 'ConditionalCheckFailedException'
		const mockDynamo = {
			send: vi.fn().mockRejectedValue(error),
		} as any
		const store = new DynamoDbCoordinationStore({ client: mockDynamo, tableName: 'test' })

		const result = await store.extendTTL('test-key', 120)

		expect(result).toBe(false)
	})

	it('should get a value', async () => {
		const mockDynamo = {
			send: vi.fn().mockResolvedValue({
				Item: { value: { S: 'test-value' } },
			}),
		} as any
		const store = new DynamoDbCoordinationStore({ client: mockDynamo, tableName: 'test' })

		const result = await store.get('test-key')

		expect(result).toBe('test-value')
	})

	it('should return undefined when item does not exist', async () => {
		const mockDynamo = {
			send: vi.fn().mockResolvedValue({ Item: undefined }),
		} as any
		const store = new DynamoDbCoordinationStore({ client: mockDynamo, tableName: 'test' })

		const result = await store.get('test-key')

		expect(result).toBeUndefined()
	})
})

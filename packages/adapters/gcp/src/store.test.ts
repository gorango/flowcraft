import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RedisCoordinationStore } from './store'

function createMockRedis() {
	return {
		pipeline: vi.fn().mockReturnValue({
			incr: vi.fn().mockReturnThis(),
			expire: vi.fn().mockReturnThis(),
			exec: vi.fn().mockResolvedValue([[null, 5]]),
		}),
		set: vi.fn().mockResolvedValue('OK'),
		del: vi.fn().mockResolvedValue(1),
		expire: vi.fn().mockResolvedValue(1),
		get: vi.fn().mockResolvedValue('value'),
	}
}

describe('RedisCoordinationStore - Unit Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('should increment a key and set TTL', async () => {
		const mockRedis = createMockRedis() as any
		const store = new RedisCoordinationStore(mockRedis)

		const result = await store.increment('test-key', 60)

		expect(mockRedis.pipeline).toHaveBeenCalled()
		expect(result).toBe(5)
	})

	it('should return 0 when pipeline returns null', async () => {
		const mockRedis = {
			pipeline: vi.fn().mockReturnValue({
				incr: vi.fn().mockReturnThis(),
				expire: vi.fn().mockReturnThis(),
				exec: vi.fn().mockResolvedValue(null),
			}),
		} as any
		const store = new RedisCoordinationStore(mockRedis)

		const result = await store.increment('test-key', 60)

		expect(result).toBe(0)
	})

	it('should set a value if key does not exist', async () => {
		const mockRedis = createMockRedis() as any
		const store = new RedisCoordinationStore(mockRedis)

		const result = await store.setIfNotExist('test-key', 'test-value', 60)

		expect(mockRedis.set).toHaveBeenCalledWith('test-key', 'test-value', 'EX', 60, 'NX')
		expect(result).toBe(true)
	})

	it('should return false when key already exists', async () => {
		const mockRedis = {
			set: vi.fn().mockResolvedValue(null),
		} as any
		const store = new RedisCoordinationStore(mockRedis)

		const result = await store.setIfNotExist('test-key', 'test-value', 60)

		expect(result).toBe(false)
	})

	it('should delete a key', async () => {
		const mockRedis = createMockRedis() as any
		const store = new RedisCoordinationStore(mockRedis)

		await store.delete('test-key')

		expect(mockRedis.del).toHaveBeenCalledWith('test-key')
	})

	it('should extend TTL of a key', async () => {
		const mockRedis = createMockRedis() as any
		const store = new RedisCoordinationStore(mockRedis)

		const result = await store.extendTTL('test-key', 120)

		expect(mockRedis.expire).toHaveBeenCalledWith('test-key', 120)
		expect(result).toBe(true)
	})

	it('should return false when key does not exist for extendTTL', async () => {
		const mockRedis = {
			expire: vi.fn().mockResolvedValue(0),
		} as any
		const store = new RedisCoordinationStore(mockRedis)

		const result = await store.extendTTL('test-key', 120)

		expect(result).toBe(false)
	})

	it('should get a value', async () => {
		const mockRedis = createMockRedis() as any
		const store = new RedisCoordinationStore(mockRedis)

		const result = await store.get('test-key')

		expect(mockRedis.get).toHaveBeenCalledWith('test-key')
		expect(result).toBe('value')
	})

	it('should return undefined when key does not exist', async () => {
		const mockRedis = {
			get: vi.fn().mockResolvedValue(null),
		} as any
		const store = new RedisCoordinationStore(mockRedis)

		const result = await store.get('test-key')

		expect(result).toBeUndefined()
	})
})

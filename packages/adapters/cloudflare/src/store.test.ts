import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DurableObjectStorage } from './context'
import { DurableObjectCoordinationStore } from './store'

describe('DurableObjectCoordinationStore', () => {
	let store: DurableObjectCoordinationStore
	let mockStorage: DurableObjectStorage

	beforeEach(() => {
		mockStorage = {
			get: vi.fn(),
			put: vi.fn(),
			delete: vi.fn(),
			list: vi.fn().mockResolvedValue(new Map()),
		}
		store = new DurableObjectCoordinationStore({ namespace: mockStorage })
	})

	describe('increment', () => {
		it('should increment a new key from 0', async () => {
			vi.mocked(mockStorage.get).mockResolvedValue(undefined)

			const result = await store.increment('counter-key', 3600)

			expect(mockStorage.get).toHaveBeenCalledWith('counter-key')
			expect(mockStorage.put).toHaveBeenCalledWith('counter-key', 1)
			expect(result).toBe(1)
		})

		it('should increment an existing key', async () => {
			vi.mocked(mockStorage.get).mockResolvedValue(5)

			const result = await store.increment('counter-key', 3600)

			expect(result).toBe(6)
			expect(mockStorage.put).toHaveBeenCalledWith('counter-key', 6)
		})

		it('should handle undefined as 0', async () => {
			vi.mocked(mockStorage.get).mockResolvedValue(undefined)

			const result = await store.increment('counter-key', 3600)

			expect(result).toBe(1)
		})
	})

	describe('setIfNotExist', () => {
		it('should return false when key exists', async () => {
			vi.mocked(mockStorage.get).mockResolvedValue('existing-value')

			const result = await store.setIfNotExist('some-key', 'new-value', 3600)

			expect(result).toBe(false)
			expect(mockStorage.put).not.toHaveBeenCalled()
		})

		it('should set value when key does not exist (atomic)', async () => {
			vi.mocked(mockStorage.get).mockResolvedValue(undefined)
			vi.mocked(mockStorage.put).mockResolvedValue()

			const result = await store.setIfNotExist('new-key', 'new-value', 3600)

			expect(result).toBe(true)
			expect(mockStorage.put).toHaveBeenCalledWith('new-key', 'new-value', {
				onlyIf: { equals: undefined },
			})
		})

		it('should return false when put throws (key already existed)', async () => {
			vi.mocked(mockStorage.get).mockResolvedValue(undefined)
			vi.mocked(mockStorage.put).mockRejectedValue(new Error('ConditionalCheckFailedException'))

			const result = await store.setIfNotExist('new-key', 'new-value', 3600)

			expect(result).toBe(false)
		})
	})

	describe('delete', () => {
		it('should delete key from storage', async () => {
			vi.mocked(mockStorage.delete).mockResolvedValue(true)

			await store.delete('some-key')

			expect(mockStorage.delete).toHaveBeenCalledWith('some-key')
		})
	})

	describe('extendTTL', () => {
		it('should return false when key does not exist', async () => {
			vi.mocked(mockStorage.get).mockResolvedValue(undefined)

			const result = await store.extendTTL('missing-key', 3600)

			expect(result).toBe(false)
		})

		it('should extend TTL for existing key', async () => {
			vi.mocked(mockStorage.get).mockResolvedValue('some-value')
			vi.mocked(mockStorage.put).mockResolvedValue()

			const result = await store.extendTTL('existing-key', 7200)

			expect(result).toBe(true)
			expect(mockStorage.put).toHaveBeenCalledWith('existing-key', 'some-value')
		})
	})

	describe('get', () => {
		it('should return undefined when key not found', async () => {
			vi.mocked(mockStorage.get).mockResolvedValue(undefined)

			const result = await store.get('missing-key')

			expect(result).toBeUndefined()
		})

		it('should return value when key exists', async () => {
			vi.mocked(mockStorage.get).mockResolvedValue('stored-value')

			const result = await store.get('existing-key')

			expect(result).toBe('stored-value')
		})
	})
})

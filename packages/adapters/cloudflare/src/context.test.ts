import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DurableObjectContext, type DurableObjectStorage } from './context'

describe('DurableObjectContext', () => {
	let context: DurableObjectContext
	let mockStorage: DurableObjectStorage

	beforeEach(() => {
		mockStorage = {
			get: vi.fn(),
			put: vi.fn(),
			delete: vi.fn(),
			list: vi.fn().mockResolvedValue(new Map()),
		}
		context = new DurableObjectContext('run-123', {
			storage: mockStorage,
			runId: 'run-123',
		})
	})

	describe('get', () => {
		it('should retrieve value from storage with prefixed key', async () => {
			vi.mocked(mockStorage.get).mockResolvedValue('test-value')

			const result = await context.get('someKey')

			expect(mockStorage.get).toHaveBeenCalledWith('run-123:someKey')
			expect(result).toBe('test-value')
		})

		it('should return undefined for missing key', async () => {
			vi.mocked(mockStorage.get).mockResolvedValue(undefined)

			const result = await context.get('missingKey')

			expect(result).toBeUndefined()
		})
	})

	describe('set', () => {
		it('should store value with prefixed key', async () => {
			vi.mocked(mockStorage.put).mockResolvedValue()

			await context.set('myKey', { foo: 'bar' })

			expect(mockStorage.put).toHaveBeenCalledWith('run-123:myKey', { foo: 'bar' })
		})
	})

	describe('has', () => {
		it('should return true when key exists', async () => {
			vi.mocked(mockStorage.get).mockResolvedValue('some-value')

			const result = await context.has('existingKey')

			expect(result).toBe(true)
		})

		it('should return false when key does not exist', async () => {
			vi.mocked(mockStorage.get).mockResolvedValue(undefined)

			const result = await context.has('missingKey')

			expect(result).toBe(false)
		})
	})

	describe('delete', () => {
		it('should delete key from storage', async () => {
			vi.mocked(mockStorage.delete).mockResolvedValue(true)

			const result = await context.delete('myKey')

			expect(mockStorage.delete).toHaveBeenCalledWith('run-123:myKey')
			expect(result).toBe(true)
		})
	})

	describe('toJSON', () => {
		it('should return all keys without runId prefix', async () => {
			const storageMap = new Map()
			storageMap.set('run-123:_outputs.node1', 'output1')
			storageMap.set('run-123:_outputs.node2', 'output2')
			storageMap.set('run-123:status', 'running')
			vi.mocked(mockStorage.list).mockResolvedValue(storageMap)

			const result = await context.toJSON()

			expect(result).toEqual({
				'_outputs.node1': 'output1',
				'_outputs.node2': 'output2',
				status: 'running',
			})
		})

		it('should return empty object when no data', async () => {
			vi.mocked(mockStorage.list).mockResolvedValue(new Map())

			const result = await context.toJSON()

			expect(result).toEqual({})
		})
	})

	describe('patch', () => {
		it('should apply set operations', async () => {
			vi.mocked(mockStorage.put).mockResolvedValue()

			await context.patch([
				{ op: 'set', key: 'key1', value: 'value1' },
				{ op: 'set', key: 'key2', value: 'value2' },
			])

			expect(mockStorage.put).toHaveBeenCalledTimes(2)
			expect(mockStorage.put).toHaveBeenCalledWith('run-123:key1', 'value1')
			expect(mockStorage.put).toHaveBeenCalledWith('run-123:key2', 'value2')
		})

		it('should apply delete operations', async () => {
			vi.mocked(mockStorage.delete).mockResolvedValue(true)

			await context.patch([{ op: 'delete', key: 'keyToRemove' }])

			expect(mockStorage.delete).toHaveBeenCalledWith('run-123:keyToRemove')
		})

		it('should do nothing for empty operations', async () => {
			await context.patch([])

			expect(mockStorage.put).not.toHaveBeenCalled()
			expect(mockStorage.delete).not.toHaveBeenCalled()
		})
	})

	it('should have type async', () => {
		expect(context.type).toBe('async')
	})
})

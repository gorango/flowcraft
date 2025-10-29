import { describe, expect, it, vi } from 'vitest'
import { AsyncContextView, Context, TrackedAsyncContext } from '../src/context'

describe('State Management (Context)', () => {
	describe('Context (Synchronous)', () => {
		it('should initialize with provided data', () => {
			const context = new Context({ key1: 'value1', key2: 42 })
			expect(context.get('key1')).toBe('value1')
			expect(context.get('key2')).toBe(42)
		})

		it('should correctly set a new value', () => {
			const context = new Context()
			context.set('key', 'value')
			expect(context.get('key')).toBe('value')
		})

		it('should correctly get an existing value', () => {
			const context = new Context({ key: 'value' })
			expect(context.get('key')).toBe('value')
		})

		it('should return undefined for a non-existent key', () => {
			const context = new Context()
			expect(context.get('nonexistent')).toBeUndefined()
		})

		it('should correctly report `has` for an existing key', () => {
			const context = new Context({ key: 'value' })
			expect(context.has('key')).toBe(true)
		})

		it('should correctly report `has` for a non-existent key', () => {
			const context = new Context()
			expect(context.has('nonexistent')).toBe(false)
		})

		it('should correctly delete a key and return true', () => {
			const context = new Context({ key: 'value' })
			expect(context.delete('key')).toBe(true)
			expect(context.has('key')).toBe(false)
		})

		it('should return false when deleting a non-existent key', () => {
			const context = new Context()
			expect(context.delete('nonexistent')).toBe(false)
		})

		it('should produce a correct JSON object representation', () => {
			const context = new Context({ str: 'string', num: 123, bool: true })
			const json = context.toJSON()
			expect(json).toEqual({ str: 'string', num: 123, bool: true })
		})
	})

	describe('AsyncContextView (Asynchronous Wrapper)', () => {
		it('should resolve a `get` call with the underlying sync value', async () => {
			const syncContext = new Context<Record<string, any>>({ key: 'value' })
			const asyncContext = new AsyncContextView(syncContext)
			const result = await asyncContext.get('key')
			expect(result).toBe('value')
		})

		it('should resolve a `set` call and update the underlying sync context', async () => {
			const syncContext = new Context<Record<string, any>>()
			const asyncContext = new AsyncContextView(syncContext)
			await asyncContext.set('key', 'value')
			expect(syncContext.get('key')).toBe('value')
		})

		it('should resolve a `has` call with the underlying sync boolean', async () => {
			const syncContext = new Context<Record<string, any>>({ key: 'value' })
			const asyncContext = new AsyncContextView(syncContext)
			const result = await asyncContext.has('key')
			expect(result).toBe(true)
		})

		it('should resolve a `delete` call and update the underlying sync context', async () => {
			const syncContext = new Context<Record<string, any>>({ key: 'value' })
			const asyncContext = new AsyncContextView(syncContext)
			const result = await asyncContext.delete('key')
			expect(result).toBe(true)
			expect(syncContext.has('key')).toBe(false)
		})

		it('should resolve `toJSON` with the underlying sync context data', async () => {
			const syncContext = new Context<Record<string, any>>({ key: 'value' })
			const asyncContext = new AsyncContextView(syncContext)
			const json = await asyncContext.toJSON()
			expect(json).toEqual({ key: 'value' })
		})
	})

	describe('TrackedAsyncContext (Change Tracking)', () => {
		it('should track set operations', async () => {
			const syncContext = new Context<Record<string, any>>()
			const asyncContext = new AsyncContextView(syncContext)
			const trackedContext = new TrackedAsyncContext(asyncContext)
			await trackedContext.set('key', 'value')
			expect(await trackedContext.get('key')).toBe('value')
			// Check deltas
			const deltas = (trackedContext as any).deltas
			expect(deltas).toEqual([{ op: 'set', key: 'key', value: 'value' }])
		})

		it('should track delete operations', async () => {
			const syncContext = new Context<Record<string, any>>({ key: 'value' })
			const asyncContext = new AsyncContextView(syncContext)
			const trackedContext = new TrackedAsyncContext(asyncContext)
			const result = await trackedContext.delete('key')
			expect(result).toBe(true)
			const deltas = (trackedContext as any).deltas
			expect(deltas).toEqual([{ op: 'delete', key: 'key' }])
		})

		it('should delegate get and has to inner context', async () => {
			const syncContext = new Context<Record<string, any>>({ key: 'value' })
			const asyncContext = new AsyncContextView(syncContext)
			const trackedContext = new TrackedAsyncContext(asyncContext)
			expect(await trackedContext.get('key')).toBe('value')
			expect(await trackedContext.has('key')).toBe(true)
			expect(await trackedContext.has('nonexistent')).toBe(false)
		})

		it('should throw on patch operations', async () => {
			const syncContext = new Context<Record<string, any>>()
			const asyncContext = new AsyncContextView(syncContext)
			const trackedContext = new TrackedAsyncContext(asyncContext)
			await expect(trackedContext.patch([])).rejects.toThrow('Patch operations not supported')
		})

		it('should support patch operations with set and delete', async () => {
			const mockInnerContext = {
				get: vi.fn().mockResolvedValue(undefined),
				set: vi.fn().mockResolvedValue(undefined),
				has: vi.fn().mockResolvedValue(false),
				delete: vi.fn().mockResolvedValue(true),
				toJSON: vi.fn().mockResolvedValue({}),
				// No patch method, so TrackedAsyncContext will use set/delete
			} as any
			const trackedContext = new TrackedAsyncContext(mockInnerContext)
			await trackedContext.patch([
				{ op: 'set', key: 'newKey', value: 'newValue' },
				{ op: 'delete', key: 'existing' },
			])
			expect(mockInnerContext.set).toHaveBeenCalledWith('newKey', 'newValue')
			expect(mockInnerContext.delete).toHaveBeenCalledWith('existing')
		})

		it('should return and clear deltas', async () => {
			const syncContext = new Context<Record<string, any>>()
			const asyncContext = new AsyncContextView(syncContext)
			const trackedContext = new TrackedAsyncContext(asyncContext)
			await trackedContext.set('key1', 'value1')
			await trackedContext.set('key2', 'value2')
			await trackedContext.delete('key1')

			const deltas = (trackedContext as any).getDeltas()
			expect(deltas).toEqual([
				{ op: 'set', key: 'key1', value: 'value1' },
				{ op: 'set', key: 'key2', value: 'value2' },
				{ op: 'delete', key: 'key1' },
			])

			;(trackedContext as any).clearDeltas()
			expect((trackedContext as any).getDeltas()).toEqual([])
		})
	})
})

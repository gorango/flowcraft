import { describe, expect, it } from 'vitest'
import { Context, createContext } from './context'

describe('Context', () => {
	const metadata = {
		executionId: 'test-execution',
		blueprintId: 'test-blueprint',
		currentNodeId: 'test-node',
		startedAt: new Date(),
		environment: 'development' as const,
	}

	describe('initialization', () => {
		it('should initialize with or without initial data', () => {
			// without initial data
			const emptyContext = new Context({}, metadata)
			expect(emptyContext.size).toBe(0)

			// with initial data
			const contextWithData = new Context({ key1: 'value1', key2: 42 }, metadata)
			expect(contextWithData.get('key1')).toBe('value1')
			expect(contextWithData.get('key2')).toBe(42)
			expect(contextWithData.size).toBe(2)
		})
	})

	describe('CRUD operations', () => {
		it('should perform basic CRUD operations correctly', () => {
			const context = new Context<{ key1: string, key2: number, key3: boolean }>(
				{ key1: 'initial', key2: 10 },
				metadata,
			)

			// create/set
			context.set('key3', true)
			expect(context.get('key3')).toBe(true)

			// read/get
			expect(context.get('key1')).toBe('initial')
			expect(context.get('key2')).toBe(10)

			// update
			context.set('key1', 'updated')
			expect(context.get('key1')).toBe('updated')

			// delete
			expect(context.delete('key2')).toBe(true)
			expect(context.get('key2')).toBeUndefined()
			expect(context.delete('nonexistent' as any)).toBe(false)
		})
	})

	describe('serialization', () => {
		it('should correctly serialize and deserialize a plain object', () => {
			const originalData = {
				str: 'string',
				num: 123,
				bool: true,
				nested: { a: 1 },
				arr: [1, 'b', false],
			}
			const context = new Context(originalData, metadata)

			const serialized = context.toJSON()
			expect(serialized).toEqual(originalData)

			const deserializedContext = Context.fromJSON(serialized, metadata)
			expect(deserializedContext.get('str')).toBe('string')
			expect(deserializedContext.get('nested')?.a).toBe(1)
		})
	})

	describe('metadata and scoping', () => {
		it('should manage metadata correctly with setMetadata()', () => {
			const context = new Context({ key: 'value' }, metadata)

			context.setMetadata({
				currentNodeId: 'updated-node',
				environment: 'production',
			})

			expect(context.get('key')).toBe('value') // data preserved
			expect(context.getMetadata().currentNodeId).toBe('updated-node')
			expect(context.getMetadata().environment).toBe('production')
			expect(context.getMetadata().executionId).toBe('test-execution') // original preserved
		})
	})

	describe('createContext helper', () => {
		it('should create a context using the helper function', () => {
			const context = createContext({ key: 'value' }, metadata)

			expect(context.get('key')).toBe('value')
			expect(context.getMetadata()).toEqual(metadata)
		})
	})
})

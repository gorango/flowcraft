import { describe, expect, it } from 'vitest'
import { Context, createContext } from './context.js'

describe('Context', () => {
	describe('initialization', () => {
		it('should initialize with or without initial data', () => {
			const metadata = {
				executionId: 'test-execution',
				blueprintId: 'test-blueprint',
				currentNodeId: 'test-node',
				startedAt: new Date(),
				environment: 'development' as const,
			}

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
			const metadata = {
				executionId: 'test-execution',
				blueprintId: 'test-blueprint',
				currentNodeId: 'test-node',
				startedAt: new Date(),
				environment: 'development' as const,
			}

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

		it('should accurately report state', () => {
			const metadata = {
				executionId: 'test-execution',
				blueprintId: 'test-blueprint',
				currentNodeId: 'test-node',
				startedAt: new Date(),
				environment: 'development' as const,
			}

			const context = new Context<{ a: string, b: number, c: boolean }>(
				{ a: 'test', b: 42, c: true },
				metadata,
			)

			// keys
			expect(context.keys()).toEqual(['a', 'b', 'c'])

			// values
			expect(context.values()).toEqual(['test', 42, true])

			// entries
			expect(context.entries()).toEqual([['a', 'test'], ['b', 42], ['c', true]])

			// size
			expect(context.size).toBe(3)

			// has
			expect(context.has('a')).toBe(true)
			expect(context.has('nonexistent' as any)).toBe(false)
		})
	})

	describe('serialization', () => {
		it('should correctly serialize and deserialize a Date object', () => {
			const metadata = {
				executionId: 'test-execution',
				blueprintId: 'test-blueprint',
				currentNodeId: 'test-node',
				startedAt: new Date(),
				environment: 'development' as const,
			}

			const originalDate = new Date('2023-01-01T00:00:00.000Z')
			const context = new Context<{ date: Date }>({ date: originalDate }, metadata)

			const serialized = context.toJSON()
			const deserializedContext = Context.fromJSON(serialized, metadata)

			expect(deserializedContext.get('date')).toEqual(originalDate)
		})

		it('should correctly serialize and deserialize a Map object', () => {
			const metadata = {
				executionId: 'test-execution',
				blueprintId: 'test-blueprint',
				currentNodeId: 'test-node',
				startedAt: new Date(),
				environment: 'development' as const,
			}

			const originalMap = new Map([['key1', 'value1'], ['key2', 'value2']])
			const context = new Context<{ map: Map<string, string> }>({ map: originalMap }, metadata)

			const serialized = context.toJSON()
			const deserializedContext = Context.fromJSON(serialized, metadata)

			const deserializedMap = deserializedContext.get('map')
			expect(deserializedMap).toBeInstanceOf(Map)
			expect(deserializedMap?.get('key1')).toBe('value1')
			expect(deserializedMap?.get('key2')).toBe('value2')
		})

		it('should correctly serialize and deserialize a Set object', () => {
			const metadata = {
				executionId: 'test-execution',
				blueprintId: 'test-blueprint',
				currentNodeId: 'test-node',
				startedAt: new Date(),
				environment: 'development' as const,
			}

			const originalSet = new Set(['item1', 'item2', 'item3'])
			const context = new Context<{ set: Set<string> }>({ set: originalSet }, metadata)

			const serialized = context.toJSON()
			const deserializedContext = Context.fromJSON(serialized, metadata)

			const deserializedSet = deserializedContext.get('set')
			expect(deserializedSet).toBeInstanceOf(Set)
			expect(deserializedSet?.has('item1')).toBe(true)
			expect(deserializedSet?.has('item2')).toBe(true)
			expect(deserializedSet?.has('item3')).toBe(true)
		})

		it('should correctly serialize and deserialize a RegExp object', () => {
			const metadata = {
				executionId: 'test-execution',
				blueprintId: 'test-blueprint',
				currentNodeId: 'test-node',
				startedAt: new Date(),
				environment: 'development' as const,
			}

			const originalRegExp = /test/gi
			const context = new Context<{ regex: RegExp }>({ regex: originalRegExp }, metadata)

			const serialized = context.toJSON()
			const deserializedContext = Context.fromJSON(serialized, metadata)

			const deserializedRegExp = deserializedContext.get('regex')
			expect(deserializedRegExp).toBeInstanceOf(RegExp)
			expect(deserializedRegExp?.source).toBe('test')
			expect(deserializedRegExp?.flags).toBe('gi')
		})

		it('should correctly serialize and deserialize an Error object', () => {
			const metadata = {
				executionId: 'test-execution',
				blueprintId: 'test-blueprint',
				currentNodeId: 'test-node',
				startedAt: new Date(),
				environment: 'development' as const,
			}

			const originalError = new Error('Test error message')
			const context = new Context<{ error: Error }>({ error: originalError }, metadata)

			const serialized = context.toJSON()
			const deserializedContext = Context.fromJSON(serialized, metadata)

			const deserializedError = deserializedContext.get('error')
			expect(deserializedError).toBeInstanceOf(Error)
			expect(deserializedError?.message).toBe('Test error message')
			expect(deserializedError?.stack).toBeDefined()
		})

		it('should handle nested complex types in serialization', () => {
			const metadata = {
				executionId: 'test-execution',
				blueprintId: 'test-blueprint',
				currentNodeId: 'test-node',
				startedAt: new Date(),
				environment: 'development' as const,
			}

			const nestedData = {
				date: new Date('2023-01-01T00:00:00.000Z'),
				map: new Map([['nested', new Set(['a', 'b'])]]),
				error: new Error('Nested error'),
			}

			const context = new Context<typeof nestedData>(nestedData, metadata)

			const serialized = context.toJSON()
			const deserializedContext = Context.fromJSON(serialized, metadata)

			// const deserializedData = deserializedContext.toJSON()

			// check that nested structures are preserved
			expect(deserializedContext.get('date')).toEqual(nestedData.date)
			expect(deserializedContext.get('map')).toBeInstanceOf(Map)
			expect(deserializedContext.get('map')?.get('nested')).toBeInstanceOf(Set)
			expect(deserializedContext.get('error')).toBeInstanceOf(Error)
		})
	})

	describe('metadata and scoping', () => {
		it('should manage metadata correctly with withMetadata()', () => {
			const metadata = {
				executionId: 'test-execution',
				blueprintId: 'test-blueprint',
				currentNodeId: 'test-node',
				startedAt: new Date(),
				environment: 'development' as const,
			}

			const context = new Context({ key: 'value' }, metadata)

			const updatedContext = context.withMetadata({
				currentNodeId: 'updated-node',
				environment: 'production',
			})

			expect(updatedContext.get('key')).toBe('value') // data preserved
			expect(updatedContext.getMetadata().currentNodeId).toBe('updated-node')
			expect(updatedContext.getMetadata().environment).toBe('production')
			expect(updatedContext.getMetadata().executionId).toBe('test-execution') // original preserved
		})

		it('should create a scoped context without mutating the original', () => {
			const metadata = {
				executionId: 'test-execution',
				blueprintId: 'test-blueprint',
				currentNodeId: 'test-node',
				startedAt: new Date(),
				environment: 'development' as const,
			}

			const originalContext = new Context(
				{ shared: 'shared-value', original: 'original-value' },
				metadata,
			)

			const scopedContext = originalContext.createScope({
				scoped: 'scoped-value',
				shared: 'overridden-shared', // override shared value
			})

			// original context unchanged
			expect(originalContext.get('shared')).toBe('shared-value')
			expect(originalContext.get('original')).toBe('original-value')

			// scoped context has merged data
			expect(scopedContext.get('shared')).toBe('overridden-shared')
			expect(scopedContext.get('original')).toBe('original-value')
			expect((scopedContext as any).get('scoped')).toBe('scoped-value')

			// same metadata
			expect(scopedContext.getMetadata()).toEqual(originalContext.getMetadata())
		})
	})

	describe('createContext helper', () => {
		it('should create a context using the helper function', () => {
			const metadata = {
				executionId: 'test-execution',
				blueprintId: 'test-blueprint',
				currentNodeId: 'test-node',
				startedAt: new Date(),
				environment: 'development' as const,
			}

			const context = createContext({ key: 'value' }, metadata)

			expect(context.get('key')).toBe('value')
			expect(context.getMetadata()).toEqual(metadata)
		})
	})
})

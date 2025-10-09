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
		it('should initialize with or without initial data', async () => {
			// without initial data
			const emptyContext = new Context({}, metadata)
			expect(emptyContext.size).toBe(0)

			// with initial data
			const contextWithData = new Context({ key1: 'value1', key2: 42 }, metadata)
			expect(await contextWithData.get('key1')).toBe('value1')
			expect(await contextWithData.get('key2')).toBe(42)
			expect(contextWithData.size).toBe(2)
		})
	})

	describe('CRUD operations', () => {
		it('should perform basic CRUD operations correctly', async () => {
			const context = new Context<{ key1: string, key2: number, key3: boolean }>(
				{ key1: 'initial', key2: 10 },
				metadata,
			)

			// create/set
			await context.set('key3', true)
			expect(await context.get('key3')).toBe(true)

			// read/get
			expect(await context.get('key1')).toBe('initial')
			expect(await context.get('key2')).toBe(10)

			// update
			await context.set('key1', 'updated')
			expect(await context.get('key1')).toBe('updated')

			// delete
			expect(await context.delete('key2')).toBe(true)
			expect(await context.get('key2')).toBeUndefined()
			expect(await context.delete('nonexistent' as any)).toBe(false)
		})
	})

	describe('serialization', () => {
		it('should correctly serialize and deserialize a plain object', async () => {
			const originalData = {
				str: 'string',
				num: 123,
				bool: true,
				nested: { a: 1 },
				arr: [1, 'b', false],
			}
			const context = new Context(originalData, metadata)

			const serialized = await context.toJSON()
			expect(serialized).toEqual(originalData)

			const deserializedContext = Context.fromJSON(serialized, metadata)
			expect(await deserializedContext.get('str')).toBe('string')
			expect((await deserializedContext.get('nested'))?.a).toBe(1)
		})
	})

	describe('metadata and scoping', () => {
		it('should manage metadata correctly with setMetadata()', async () => {
			const context = new Context({ key: 'value' }, metadata)

			context.setMetadata({
				currentNodeId: 'updated-node',
				environment: 'production',
			})

			expect(await context.get('key')).toBe('value') // data preserved
			expect(context.getMetadata().currentNodeId).toBe('updated-node')
			expect(context.getMetadata().environment).toBe('production')
			expect(context.getMetadata().executionId).toBe('test-execution') // original preserved
		})
	})

	describe('createContext helper', () => {
		it('should create a context using the helper function', async () => {
			const context = createContext({ key: 'value' }, metadata)

			expect(await context.get('key')).toBe('value')
			expect(context.getMetadata()).toEqual(metadata)
		})
	})
})

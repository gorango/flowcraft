import { describe, it, expect } from 'vitest'
import { DirectResolver } from '../../src/resolve/direct'
import { RegistryResolver } from '../../src/resolve/registry'
import { DatabaseResolver } from '../../src/resolve/database'
import { CompositeResolver } from '../../src/resolve/composite'
import type { BlueprintDatabase } from '../../src/types'

const mockBlueprint = {
	id: 'test-bp',
	nodes: [{ id: 'a', uses: 'mock_node' }],
	edges: [],
	metadata: { version: '1.0' },
}

const mockBlueprintV2 = {
	id: 'test-bp',
	nodes: [
		{ id: 'a', uses: 'mock_node' },
		{ id: 'b', uses: 'wait' },
	],
	edges: [{ source: 'a', target: 'b' }],
	metadata: { version: '2.0' },
}

describe('DirectResolver', () => {
	it('resolves latest version by default', async () => {
		const resolver = new DirectResolver({ 'test-bp': [mockBlueprint, mockBlueprintV2] })
		const result = await resolver.resolve({ id: 'test-bp' })
		expect(result.version).toBe('2.0')
		expect(result.blueprint.nodes).toHaveLength(2)
	})

	it('resolves specific version', async () => {
		const resolver = new DirectResolver({ 'test-bp': [mockBlueprint, mockBlueprintV2] })
		const result = await resolver.resolve({ id: 'test-bp', version: '1.0' })
		expect(result.version).toBe('1.0')
		expect(result.blueprint.nodes).toHaveLength(1)
	})

	it('throws for missing blueprint', async () => {
		const resolver = new DirectResolver({})
		await expect(resolver.resolve({ id: 'nonexistent' })).rejects.toThrow('Blueprint not found')
	})

	it('throws for missing version', async () => {
		const resolver = new DirectResolver({ 'test-bp': [mockBlueprint] })
		await expect(resolver.resolve({ id: 'test-bp', version: '99.0' })).rejects.toThrow(
			'Blueprint version not found',
		)
	})

	it('accepts Map input', async () => {
		const map = new Map([['test-bp', [mockBlueprint]]])
		const resolver = new DirectResolver(map)
		const result = await resolver.resolve({ id: 'test-bp' })
		expect(result.blueprint.id).toBe('test-bp')
	})

	it('requires id parameter', async () => {
		const resolver = new DirectResolver({ 'test-bp': [mockBlueprint] })
		await expect(resolver.resolve({})).rejects.toThrow('Blueprint id is required')
	})
})

describe('RegistryResolver', () => {
	it('resolves blueprint from registry', async () => {
		const resolver = new RegistryResolver({} as never, { 'test-bp': mockBlueprint })
		const result = await resolver.resolve({ id: 'test-bp' })
		expect(result.blueprint.id).toBe('test-bp')
	})

	it('throws for missing blueprint', async () => {
		const resolver = new RegistryResolver({} as never, {})
		await expect(resolver.resolve({ id: 'nonexistent' })).rejects.toThrow(
			'Blueprint not found in registry',
		)
	})

	it('adds blueprint dynamically', async () => {
		const resolver = new RegistryResolver({} as never, {})
		resolver.addBlueprint('test-bp', mockBlueprint)
		const result = await resolver.resolve({ id: 'test-bp' })
		expect(result.blueprint.id).toBe('test-bp')
	})

	it('validates version match', async () => {
		const resolver = new RegistryResolver({} as never, { 'test-bp': mockBlueprint })
		await expect(resolver.resolve({ id: 'test-bp', version: '2.0' })).rejects.toThrow(
			'Blueprint version not found',
		)
	})
})

describe('DatabaseResolver', () => {
	const mockDb: BlueprintDatabase = {
		find: async ({ id, version }) => ({
			blueprint: {
				...mockBlueprint,
				id,
				metadata: { version: version ?? '1.0' },
			},
			version: version ?? '1.0',
		}),
		list: async () => [{ id: 'test-bp', version: '1.0' }],
	}

	it('delegates to database find', async () => {
		const resolver = new DatabaseResolver(mockDb)
		const result = await resolver.resolve({ id: 'test-bp', version: '2.0' })
		expect(result.version).toBe('2.0')
	})

	it('delegates to database list', async () => {
		const resolver = new DatabaseResolver(mockDb)
		const result = await resolver.list({ limit: 10 })
		expect(result).toHaveLength(1)
	})

	it('requires id parameter', async () => {
		const resolver = new DatabaseResolver(mockDb)
		await expect(resolver.resolve({})).rejects.toThrow('Blueprint id is required')
	})
})

describe('CompositeResolver', () => {
	it('tries resolvers in order', async () => {
		const first = {
			resolve: async () => {
				throw new Error('not found')
			},
		}
		const second = { resolve: async () => ({ blueprint: mockBlueprint, version: '1.0' }) }
		const resolver = new CompositeResolver([first as never, second as never])
		const result = await resolver.resolve({ id: 'test-bp' })
		expect(result.blueprint.id).toBe('test-bp')
	})

	it('returns first successful result', async () => {
		const first = { resolve: async () => ({ blueprint: mockBlueprint, version: '1.0' }) }
		const second = {
			resolve: async () => {
				throw new Error('should not reach')
			},
		}
		const resolver = new CompositeResolver([first as never, second as never])
		const result = await resolver.resolve({ id: 'test-bp' })
		expect(result.blueprint.id).toBe('test-bp')
	})

	it('aggregates errors when all fail', async () => {
		const first = {
			resolve: async () => {
				throw new Error('first error')
			},
		}
		const second = {
			resolve: async () => {
				throw new Error('second error')
			},
		}
		const resolver = new CompositeResolver([first as never, second as never])
		await expect(resolver.resolve({ id: 'test-bp' })).rejects.toThrow('Tried 2 resolver(s)')
	})
})

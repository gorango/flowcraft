// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
	getNodeTypeDefinition,
	getAllNodeTypeDefinitions,
	getCategoryDefinitions,
	registerNodeTypeDefinition,
} from '../../src/registry/nodeTypes'
import type { NodeTypeDefinition } from '../../src/registry/nodeTypes'

describe('nodeTypes registry', () => {
	it('returns built-in type definitions', () => {
		const fn = getNodeTypeDefinition('custom')
		expect(fn).toBeDefined()
		expect(fn!.label).toBe('Function')
		expect(fn!.category).toBe('execution')
		expect(fn!.inputs).toHaveLength(1)
		expect(fn!.outputs).toHaveLength(1)
	})

	it('returns undefined for unknown type', () => {
		expect(getNodeTypeDefinition('nonexistent')).toBeUndefined()
	})

	it('getAllNodeTypeDefinitions returns all built-in types', () => {
		const all = getAllNodeTypeDefinitions()
		expect(all.length).toBeGreaterThanOrEqual(8)
		const types = all.map((t) => t.type)
		expect(types).toContain('custom')
		expect(types).toContain('sleep')
		expect(types).toContain('wait')
		expect(types).toContain('webhook')
		expect(types).toContain('subflow')
		expect(types).toContain('batch-scatter')
		expect(types).toContain('batch-gather')
		expect(types).toContain('loop-controller')
	})

	it('getCategoryDefinitions groups types by category', () => {
		const cats = getCategoryDefinitions()
		expect(cats.size).toBeGreaterThanOrEqual(3)
		for (const [, types] of cats) {
			expect(types.length).toBeGreaterThan(0)
			for (const t of types) {
				expect(t.category).toBeDefined()
			}
		}
	})

	it('registerNodeTypeDefinition adds a custom type', () => {
		const customDef: NodeTypeDefinition = {
			type: 'my-custom',
			label: 'My Custom',
			description: 'A custom node',
			category: 'custom',
			inputs: [],
			outputs: [],
			defaultParams: {},
			defaultInputs: {},
			schema: {},
		}
		registerNodeTypeDefinition(customDef)
		expect(getNodeTypeDefinition('my-custom')).toEqual(customDef)
	})

	it('built-in types have consistent structure', () => {
		for (const def of getAllNodeTypeDefinitions()) {
			expect(def.type).toBeTruthy()
			expect(def.label).toBeTruthy()
			expect(def.description).toBeTruthy()
			expect(['execution', 'control', 'trigger', 'flow', 'custom']).toContain(def.category)
			expect(Array.isArray(def.inputs)).toBe(true)
			expect(Array.isArray(def.outputs)).toBe(true)
			expect(def.defaultParams).toBeDefined()
			expect(def.schema).toBeDefined()
		}
	})
})

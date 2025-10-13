import type { WorkflowBlueprint } from '../src/types'
import { describe, expect, it } from 'vitest'
import { sanitizeBlueprint } from '../src/sanitizer'

describe('sanitizeBlueprint', () => {
	it('should remove extra properties from nodes and edges', () => {
		const raw = {
			id: 'test-workflow',
			nodes: [
				{
					id: 'node1',
					uses: 'test-node',
					params: { key: 'value' },
					position: { x: 100, y: 200 }, // Extra property
					style: { color: 'red' }, // Extra property
				},
			],
			edges: [
				{
					source: 'node1',
					target: 'node2',
					action: 'continue',
					position: { x: 150, y: 250 }, // Extra property
				},
			],
			metadata: { version: '1.0' },
		}

		const result = sanitizeBlueprint(raw) as WorkflowBlueprint

		expect(result.id).toBe('test-workflow')
		expect(result.nodes).toHaveLength(1)
		expect(result.nodes[0]).toEqual({
			id: 'node1',
			uses: 'test-node',
			params: { key: 'value' },
		})
		expect(result.nodes[0]).not.toHaveProperty('position')
		expect(result.nodes[0]).not.toHaveProperty('style')

		expect(result.edges).toHaveLength(1)
		expect(result.edges[0]).toEqual({
			source: 'node1',
			target: 'node2',
			action: 'continue',
		})
		expect(result.edges[0]).not.toHaveProperty('position')

		expect(result.metadata).toEqual({ version: '1.0' })
	})

	it('should handle missing nodes or edges', () => {
		const raw = {
			id: 'test-workflow',
			metadata: { version: '1.0' },
		}

		const result = sanitizeBlueprint(raw) as WorkflowBlueprint

		expect(result.nodes).toEqual([])
		expect(result.edges).toEqual([])
		expect(result.id).toBe('test-workflow')
		expect(result.metadata).toEqual({ version: '1.0' })
	})

	it('should preserve all defined properties in nodes', () => {
		const raw = {
			id: 'test-workflow',
			nodes: [
				{
					id: 'node1',
					uses: 'test-node',
					params: { key: 'value' },
					inputs: 'input-key',
					config: { maxRetries: 3 },
				},
			],
			edges: [],
		}

		const result = sanitizeBlueprint(raw) as WorkflowBlueprint

		expect(result.nodes[0]).toEqual({
			id: 'node1',
			uses: 'test-node',
			params: { key: 'value' },
			inputs: 'input-key',
			config: { maxRetries: 3 },
		})
	})

	it('should preserve all defined properties in edges', () => {
		const raw = {
			id: 'test-workflow',
			nodes: [],
			edges: [
				{
					source: 'node1',
					target: 'node2',
					action: 'continue',
					condition: 'true',
					transform: 'data.value',
				},
			],
		}

		const result = sanitizeBlueprint(raw) as WorkflowBlueprint

		expect(result.edges[0]).toEqual({
			source: 'node1',
			target: 'node2',
			action: 'continue',
			condition: 'true',
			transform: 'data.value',
		})
	})
})

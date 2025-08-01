import { describe, expect, it } from 'vitest'
import { sanitizeGraph } from './sanitize'

describe('sanitizeGraph', () => {
	it('should keep essential properties of nodes and edges and remove extras', () => {
		const rawGraph = {
			nodes: [
				{
					id: 'node-1',
					type: 'start',
					data: { value: 10 },
					config: { maxRetries: 3 },
					// Extra UI-specific properties to be removed
					position: { x: 100, y: 200 },
					style: { color: 'blue' },
				},
			],
			edges: [
				{
					id: 'edge-1',
					source: 'node-1',
					target: 'node-2',
					action: 'next',
					// Extra UI-specific properties
					label: 'Next Step',
					animated: true,
				},
			],
		}

		const sanitized = sanitizeGraph(rawGraph)

		expect(sanitized.nodes[0]).toEqual({
			id: 'node-1',
			type: 'start',
			data: { value: 10 },
			config: { maxRetries: 3 },
		})
		expect(sanitized.nodes[0]).not.toHaveProperty('position')

		expect(sanitized.edges[0]).toEqual({
			id: 'edge-1',
			source: 'node-1',
			target: 'node-2',
			action: 'next',
		})
		expect(sanitized.edges[0]).not.toHaveProperty('label')
	})

	it('should handle optional properties being absent', () => {
		const rawGraph = {
			nodes: [
				{
					id: 'node-1',
					type: 'type-a',
					// No data, no config
				},
			],
			edges: [
				{
					id: 'edge-1',
					source: 'node-1',
					target: 'node-2',
					// No action
				},
			],
		}

		const sanitized = sanitizeGraph(rawGraph)

		// The 'config' property should not be present if it was not in the original
		expect(sanitized.nodes[0]).not.toHaveProperty('config')

		// The 'data' property will be present but undefined due to destructuring
		expect(sanitized.nodes[0]).toHaveProperty('data')
		expect(sanitized.nodes[0].data).toBeUndefined()

		// The 'action' property should not be present
		expect(sanitized.edges[0]).not.toHaveProperty('action')
	})

	it('should handle an empty graph', () => {
		const rawGraph = { nodes: [], edges: [] }
		const sanitized = sanitizeGraph(rawGraph)
		expect(sanitized).toEqual({ nodes: [], edges: [] })
	})

	it('should not mutate the original raw graph object', () => {
		const rawGraph = {
			nodes: [{ id: 'node-1', type: 'test', extra: 'foo' }],
			edges: [],
		}
		const originalNodes = JSON.parse(JSON.stringify(rawGraph.nodes))

		sanitizeGraph(rawGraph)

		// Ensure the original object remains unchanged
		expect(rawGraph.nodes).toEqual(originalNodes)
	})
})

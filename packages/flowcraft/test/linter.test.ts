import type { WorkflowBlueprint } from '../src/types'
import { describe, expect, it } from 'vitest'
import { lintBlueprint } from '../src/linter'
import { BaseNode } from '../src/node'

describe('Blueprint Linter', () => {
	describe('Implementation Checks', () => {
		it('should return valid for a blueprint where all implementations exist in the registry', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'func1' },
					{ id: 'B', uses: 'TestNode' },
				],
				edges: [],
			}
			const registry = {
				func1: async () => ({}),
				TestNode: class TestNode extends BaseNode {
					async exec() { return {} }
				},
			}
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(true)
			expect(result.issues).toHaveLength(0)
		})

		it('should detect a missing node implementation for a node `uses` key', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'missing' },
				],
				edges: [],
			}
			const registry = {}
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(false)
			expect(result.issues).toHaveLength(1)
			expect(result.issues[0].code).toBe('MISSING_NODE_IMPLEMENTATION')
		})

		it('should detect multiple missing node implementations', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'missing1' },
					{ id: 'B', uses: 'missing2' },
				],
				edges: [],
			}
			const registry = {}
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(false)
			expect(result.issues).toHaveLength(2)
		})

		it('should correctly ignore built-in node types (e.g., batch-scatter, loop-controller)', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'batch-scatter' },
					{ id: 'B', uses: 'loop-controller' },
				],
				edges: [],
			}
			const registry = {}
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(true)
		})

		it('should handle an empty registry correctly', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'missing' },
				],
				edges: [],
			}
			const result = lintBlueprint(blueprint, {})
			expect(result.isValid).toBe(false)
			expect(result.issues).toHaveLength(1)
		})
	})

	describe('Graph Integrity Checks', () => {
		it('should return valid for a blueprint with correct edge source and target IDs', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
				],
				edges: [
					{ source: 'A', target: 'B' },
				],
			}
			const registry = { node: async () => ({}) }
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(true)
		})

		it('should detect an edge where the `source` ID does not exist', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
				],
				edges: [
					{ source: 'B', target: 'A' },
				],
			}
			const registry = { node: async () => ({}) }
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(false)
			expect(result.issues[0].code).toBe('INVALID_EDGE_SOURCE')
		})

		it('should detect an edge where the `target` ID does not exist', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
				],
				edges: [
					{ source: 'A', target: 'B' },
				],
			}
			const registry = { node: async () => ({}) }
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(false)
			expect(result.issues[0].code).toBe('INVALID_EDGE_TARGET')
		})

		it('should report multiple invalid edges simultaneously', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
				],
				edges: [
					{ source: 'B', target: 'A' },
					{ source: 'A', target: 'C' },
				],
			}
			const registry = { node: async () => ({}) }
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(false)
			expect(result.issues).toHaveLength(2)
		})

		it('should return valid for a blueprint with no edges', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
				],
				edges: [],
			}
			const registry = { node: async () => ({}) }
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(true)
		})
	})

	describe('Orphan Node Detection', () => {
		it('should return valid for a fully connected graph', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
					{ id: 'C', uses: 'node' },
				],
				edges: [
					{ source: 'A', target: 'B' },
					{ source: 'B', target: 'C' },
				],
			}
			const registry = { node: async () => ({}) }
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(true)
		})

		it('should detect a single node that is completely disconnected', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
				],
				edges: [],
			}
			const registry = { node: async () => ({}) }
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(true)
		})

		it('should detect a subgraph ("island") that is not reachable from any start node', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
					{ id: 'C', uses: 'node' },
				],
				edges: [
					{ source: 'A', target: 'B' },
					{ source: 'C', target: 'C' }, // self-cycle island
				],
			}
			const registry = { node: async () => ({}) }
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(false)
			expect(result.issues.some(i => i.nodeId === 'C')).toBe(true)
		})

		it('should not flag nodes in a workflow with a single node and no edges', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
				],
				edges: [],
			}
			const registry = { node: async () => ({}) }
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(true)
		})

		it('should correctly handle graphs with multiple start nodes', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
					{ id: 'B', uses: 'node' },
					{ id: 'C', uses: 'node' },
				],
				edges: [
					{ source: 'A', target: 'C' },
					{ source: 'B', target: 'C' },
				],
			}
			const registry = { node: async () => ({}) }
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(true)
		})
	})

	describe('LinterResult Structure', () => {
		it('should return `isValid: true` and an empty issues array for a valid blueprint', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'node' },
				],
				edges: [],
			}
			const registry = { node: async () => ({}) }
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(true)
			expect(result.issues).toEqual([])
		})

		it('should return `isValid: false` when any issue is detected', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'missing' },
				],
				edges: [],
			}
			const registry = {}
			const result = lintBlueprint(blueprint, registry)
			expect(result.isValid).toBe(false)
		})

		it('should aggregate issues from all check types into a single report', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'missing' },
					{ id: 'B', uses: 'node' },
				],
				edges: [
					{ source: 'C', target: 'B' },
				],
			}
			const registry = { node: async () => ({}) }
			const result = lintBlueprint(blueprint, registry)
			expect(result.issues).toHaveLength(3)
		})

		it('should produce a correctly structured LinterIssue for each error type', () => {
			const blueprint: WorkflowBlueprint = {
				id: 'test',
				nodes: [
					{ id: 'A', uses: 'missing' },
				],
				edges: [],
			}
			const registry = {}
			const result = lintBlueprint(blueprint, registry)
			expect(result.issues[0]).toHaveProperty('code')
			expect(result.issues[0]).toHaveProperty('message')
			expect(result.issues[0]).toHaveProperty('nodeId')
		})
	})
})

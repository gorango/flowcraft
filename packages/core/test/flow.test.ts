import { describe, expect, it } from 'vitest'
import { createFlow } from '../src/flow'
import { BaseNode } from '../src/node'
import type { NodeFunction } from '../src/types'

describe('Flow Builder', () => {
	describe('Blueprint Construction', () => {
		it('should add a node definition when .node() is called with a function', () => {
			const flow = createFlow('test')
			const func: NodeFunction = async () => ({ output: 'test' })
			flow.node('A', func)
			const blueprint = flow.toBlueprint()
			expect(blueprint.nodes).toHaveLength(1)
			expect(blueprint.nodes[0]).toEqual({
				id: 'A',
				uses: expect.any(String),
				params: undefined,
			})
		})

		it('should add a node definition when .node() is called with a class', () => {
			const flow = createFlow('test')
			class TestNode extends BaseNode {
				async exec() {
					return { output: 'test' }
				}
			}
			flow.node('A', TestNode)
			const blueprint = flow.toBlueprint()
			expect(blueprint.nodes).toHaveLength(1)
			expect(blueprint.nodes[0].id).toBe('A')
		})

		it('should add an edge definition when .edge() is called', () => {
			const flow = createFlow('test')
			flow.node('A', async () => ({}))
			flow.node('B', async () => ({}))
			flow.edge('A', 'B')
			const blueprint = flow.toBlueprint()
			expect(blueprint.edges).toHaveLength(1)
			expect(blueprint.edges[0]).toEqual({ source: 'A', target: 'B' })
		})

		it('should correctly add edge options like `action`, `condition`, and `transform`', () => {
			const flow = createFlow('test')
			flow.node('A', async () => ({}))
			flow.node('B', async () => ({}))
			flow.edge('A', 'B', {
				action: 'success',
				condition: 'true',
				transform: 'input',
			})
			const blueprint = flow.toBlueprint()
			expect(blueprint.edges[0]).toEqual({
				source: 'A',
				target: 'B',
				action: 'success',
				condition: 'true',
				transform: 'input',
			})
		})

		it('should throw an error if .toBlueprint() is called with no nodes', () => {
			const flow = createFlow('test')
			expect(() => flow.toBlueprint()).toThrow('Cannot build a blueprint with no nodes.')
		})

		it('should return a valid blueprint structure on .toBlueprint()', () => {
			const flow = createFlow('test')
			flow.node('A', async () => ({}))
			flow.node('B', async () => ({}))
			flow.edge('A', 'B')
			const blueprint = flow.toBlueprint()
			expect(blueprint.id).toBe('test')
			expect(blueprint.nodes).toHaveLength(2)
			expect(blueprint.edges).toHaveLength(1)
		})
	})

	describe('Function & Class Registry', () => {
		it('should register a function implementation with a unique key', () => {
			const flow = createFlow('test')
			const func: NodeFunction = async () => ({})
			flow.node('A', func)
			const registry = flow.getFunctionRegistry()
			expect(registry.size).toBe(1)
			expect(Array.from(registry.values())).toContain(func)
		})

		it('should register a class implementation using its name as the key', () => {
			const flow = createFlow('test')
			class TestNode extends BaseNode {
				async exec() {
					return {}
				}
			}
			flow.node('A', TestNode)
			const registry = flow.getFunctionRegistry()
			expect(registry.has('TestNode')).toBe(true)
		})

		it('should generate a stable random key for anonymous or generic classes', () => {
			const flow = createFlow('test')
			flow.node(
				'A',
				class extends BaseNode {
					async exec() {
						return {}
					}
				},
			)
			const registry = flow.getFunctionRegistry()
			expect(registry.size).toBe(1)
			const key = Array.from(registry.keys())[0]
			expect(key).toMatch(/^class_/)
		})

		it('should return the complete map of implementations on .getFunctionRegistry()', () => {
			const flow = createFlow('test')
			const func: NodeFunction = async () => ({})
			class TestNode extends BaseNode {
				async exec() {
					return {}
				}
			}
			flow.node('A', func)
			flow.node('B', TestNode)
			const registry = flow.getFunctionRegistry()
			expect(registry.size).toBe(2)
		})
	})

	describe('High-Level Patterns', () => {
		it('should generate `batch-scatter` and `batch-gather` nodes for a .batch() call', () => {
			const flow = createFlow('test')
			const worker: NodeFunction = async () => ({})
			flow.batch('batch1', worker, { inputKey: 'items', outputKey: 'results' })
			const blueprint = flow.toBlueprint()
			expect(blueprint.nodes).toHaveLength(2)
			expect(blueprint.nodes[0].uses).toBe('batch-scatter')
			expect(blueprint.nodes[1].uses).toBe('batch-gather')
		})

		it('should correctly wire the edges around a .batch() construct', () => {
			const flow = createFlow('test')
			const worker: NodeFunction = async () => ({})
			flow.batch('batch1', worker, { inputKey: 'items', outputKey: 'results' })
			const blueprint = flow.toBlueprint()
			expect(blueprint.edges).toHaveLength(1)
			expect(blueprint.edges[0].source).toBe('batch1_scatter')
			expect(blueprint.edges[0].target).toBe('batch1_gather')
		})

		it('should generate a `loop-controller` node for a .loop() call', () => {
			const flow = createFlow('test')
			flow.node('start', async () => ({}))
			flow.node('end', async () => ({}))
			flow.edge('start', 'end')
			flow.loop('loop1', {
				startNodeId: 'start',
				endNodeId: 'end',
				condition: 'i < 10',
			})
			const blueprint = flow.toBlueprint()
			expect(blueprint.nodes).toHaveLength(3)
			expect(blueprint.nodes[2].uses).toBe('loop-controller')
		})

		it('should wire the `continue` and `break` paths for a .loop() construct', () => {
			const flow = createFlow('test')
			flow.node('start', async () => ({}))
			flow.node('end', async () => ({}))
			flow.edge('start', 'end')
			flow.loop('loop1', {
				startNodeId: 'start',
				endNodeId: 'end',
				condition: 'i < 10',
			})
			const blueprint = flow.toBlueprint()
			expect(blueprint.edges).toHaveLength(3)
			expect(blueprint.edges[1]).toEqual({
				source: 'end',
				target: 'loop1-loop',
			})
			expect(blueprint.edges[2]).toEqual({
				source: 'loop1-loop',
				target: 'start',
				action: 'continue',
				transform: 'context.end',
			})
		})
	})

	describe('Graph Representation', () => {
		it('should return a basic UIGraph for a simple workflow', () => {
			const flow = createFlow('test')
			flow.node('A', async () => ({}))
			flow.node('B', async () => ({}))
			flow.edge('A', 'B')
			const graph = flow.toGraphRepresentation()
			expect(graph.nodes).toHaveLength(2)
			expect(graph.edges).toHaveLength(1)
			expect(graph.nodes[0].id).toBe('A')
			expect(graph.nodes[1].id).toBe('B')
			expect(graph.edges[0]).toEqual({ source: 'A', target: 'B' })
		})

		it('should replace loop controllers with direct cyclical edges', () => {
			const flow = createFlow('test')
			flow.node('start', async () => ({}))
			flow.node('end', async () => ({}))
			flow.edge('start', 'end')
			flow.loop('loop1', {
				startNodeId: 'start',
				endNodeId: 'end',
				condition: 'i < 10',
			})
			const graph = flow.toGraphRepresentation()
			expect(graph.nodes).toHaveLength(2) // start and end nodes only
			expect(graph.edges).toHaveLength(2) // original edge + loopback edge
			const loopbackEdge = graph.edges.find((edge) => edge.data?.isLoopback)
			expect(loopbackEdge).toEqual({
				source: 'end',
				target: 'start',
				data: {
					isLoopback: true,
					condition: 'i < 10',
					label: 'continue if: i < 10',
				},
			})
		})

		it('should replace batch scatter/gather pairs with a single batch-worker node', () => {
			const flow = createFlow('test')
			const worker: NodeFunction = async () => ({})
			flow.batch('batch1', worker, { inputKey: 'items', outputKey: 'results' })
			const graph = flow.toGraphRepresentation()
			expect(graph.nodes).toHaveLength(1)
			expect(graph.nodes[0].id).toBe('batch1')
			expect(graph.nodes[0].type).toBe('batch-worker')
			expect(graph.nodes[0].data?.isBatchPlaceholder).toBe(true)
			expect(graph.edges).toHaveLength(0) // No edges for standalone batch
		})

		it('should handle combined loops and batches correctly', () => {
			const flow = createFlow('test')
			flow.node('input', async () => ({}))
			const worker: NodeFunction = async () => ({})
			flow.batch('batch1', worker, { inputKey: 'items', outputKey: 'results' })
			flow.node('output', async () => ({}))
			flow.edge('input', 'batch1')
			flow.edge('batch1', 'output')
			flow.loop('loop1', {
				startNodeId: 'input',
				endNodeId: 'output',
				condition: 'i < 5',
			})
			const graph = flow.toGraphRepresentation()
			expect(graph.nodes).toHaveLength(3) // input, batch1, output
			expect(graph.edges).toHaveLength(3) // input->batch1, batch1->output, output->input (loopback)
		})

		it('should preserve node data and edge data in the graph representation', () => {
			const flow = createFlow('test')
			flow.node('A', async () => ({}), { params: { key: 'value' } })
			flow.node('B', async () => ({}))
			flow.edge('A', 'B', { action: 'success' })
			const graph = flow.toGraphRepresentation()
			expect(graph.nodes[0].params).toEqual({ key: 'value' })
			expect(graph.edges[0].action).toBe('success')
			// Note: data property is added in toGraphRepresentation for UI purposes
		})
	})
})

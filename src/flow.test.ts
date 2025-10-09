import { describe, expect, it } from 'vitest'
import { createFlow, Flow } from './flow.js'

describe('Flow Builder', () => {
	describe('basic construction', () => {
		it('should create a blueprint with an ID and empty nodes/edges', () => {
			const flow = new Flow('test-flow')

			// add a dummy node to satisfy validation
			flow.node('dummy', async () => ({ output: null }))

			const blueprint = flow.toBlueprint()

			expect(blueprint.id).toBe('test-flow')
			expect(blueprint.nodes).toHaveLength(1)
			expect(blueprint.edges).toEqual([])
			expect(blueprint.metadata).toBeUndefined()
			expect(blueprint.inputs).toBeUndefined()
			expect(blueprint.outputs).toBeUndefined()
		})

		it('should create a blueprint with metadata', () => {
			const metadata = {
				name: 'Test Flow',
				description: 'A test workflow',
				version: '1.0.0',
				tags: ['test', 'example'],
			}

			const flow = new Flow('test-flow', metadata)
			flow.node('dummy', async () => ({ output: null }))
			const blueprint = flow.toBlueprint()

			expect(blueprint.metadata).toEqual(metadata)
		})
	})

	describe('node creation', () => {
		it('should add a NodeDefinition when using an inline function', () => {
			const flow = new Flow('test-flow')

			const testFunction = async () => ({ output: 'test' })
			flow.node('test-node', testFunction)

			const blueprint = flow.toBlueprint()

			expect(blueprint.nodes).toHaveLength(1)
			expect(blueprint.nodes[0]).toEqual({
				id: 'test-node',
				uses: expect.stringMatching(/^function_test-node_\d+$/),
				params: undefined,
				config: undefined,
				inputs: undefined,
				outputs: undefined,
			})
		})

		it('should add a NodeDefinition when using a class', () => {
			const flow = new Flow('test-flow')

			class TestNode {
				async execute() {
					return { output: 'test' }
				}
			}

			flow.node('test-node', TestNode)

			const blueprint = flow.toBlueprint()

			expect(blueprint.nodes).toHaveLength(1)
			expect(blueprint.nodes[0]).toEqual({
				id: 'test-node',
				uses: 'TestNode',
				params: undefined,
				config: undefined,
				inputs: undefined,
				outputs: undefined,
			})
		})

		it('should add a NodeDefinition when using a registered name (string)', () => {
			const flow = new Flow('test-flow')

			flow.node('test-node', 'registered-node')

			const blueprint = flow.toBlueprint()

			expect(blueprint.nodes).toHaveLength(1)
			expect(blueprint.nodes[0]).toEqual({
				id: 'test-node',
				uses: 'registered-node',
				params: undefined,
				config: undefined,
				inputs: undefined,
				outputs: undefined,
			})
		})

		it('should correctly attach params and config to the NodeDefinition', () => {
			const flow = new Flow('test-flow')

			const params = { key: 'value' }
			const config = { maxRetries: 3, timeout: 5000 }

			flow.node('test-node', 'test-function', params, config)

			const blueprint = flow.toBlueprint()

			expect(blueprint.nodes[0].params).toEqual(params)
			expect(blueprint.nodes[0].config).toEqual(config)
		})
	})

	describe('edge creation', () => {
		it('should add a simple EdgeDefinition between two nodes', () => {
			const flow = new Flow('test-flow')

			flow.node('node1', 'func1')
			flow.node('node2', 'func2')
			flow.edge('node1', 'node2')

			const blueprint = flow.toBlueprint()

			expect(blueprint.edges).toHaveLength(1)
			expect(blueprint.edges[0]).toEqual({
				source: 'node1',
				target: 'node2',
				action: undefined,
				condition: undefined,
				transform: undefined,
			})
		})

		it('should add an EdgeDefinition with a specific action', () => {
			const flow = new Flow('test-flow')

			flow.node('node1', 'func1')
			flow.node('node2', 'func2')
			flow.edge('node1', 'node2', { action: 'success' })

			const blueprint = flow.toBlueprint()

			expect(blueprint.edges[0].action).toBe('success')
		})

		it('should add an EdgeDefinition with a condition', () => {
			const flow = new Flow('test-flow')

			flow.node('node1', 'func1')
			flow.node('node2', 'func2')
			flow.edge('node1', 'node2', { condition: 'result > 0' })

			const blueprint = flow.toBlueprint()

			expect(blueprint.edges[0].condition).toBe('result > 0')
		})
	})

	describe('advanced pattern builders', () => {
		it('should generate the correct blueprint structure for a parallel block', () => {
			const flow = new Flow('test-flow')

			flow.node('start', 'start-func')
			flow.node('branch1', 'branch1-func')
			flow.node('branch2', 'branch2-func')
			flow.node('end', 'end-func')

			// Manually create the parallel node and wire it
			flow.parallel('parallel-container', ['branch1', 'branch2'])
			flow.edge('start', 'parallel-container')
			flow.edge('parallel-container', 'end')

			const blueprint = flow.toBlueprint()

			// 5 nodes: start, branch1, branch2, parallel-container, end
			expect(blueprint.nodes).toHaveLength(5)
			const parallelNode = blueprint.nodes.find(n => n.id === 'parallel-container')
			expect(parallelNode).toBeDefined()
			expect(parallelNode?.uses).toBe('parallel-container')
			expect(parallelNode?.params?.branches).toEqual(['branch1', 'branch2'])

			// Edges: start->container, container->end.
			const mainEdges = blueprint.edges
			expect(mainEdges).toHaveLength(2)
			expect(mainEdges).toEqual(expect.arrayContaining([
				expect.objectContaining({ source: 'start', target: 'parallel-container' }),
				expect.objectContaining({ source: 'parallel-container', target: 'end' }),
			]))
		})

		it('should generate a blueprint with a batch-processor node for batch', () => {
			const flow = new Flow('test-flow')

			flow.node('start', 'start-func')
			flow.node('end', 'end-func')

			flow.batch('start', 'end', { batchSize: 10, concurrency: 2 })

			const blueprint = flow.toBlueprint()

			// should have 3 nodes: start, batch-processor, end
			expect(blueprint.nodes).toHaveLength(3)

			// find the batch node
			const batchNode = blueprint.nodes.find(n => n.uses === 'batch-processor')
			expect(batchNode).toBeDefined()
			expect(batchNode?.params?.batchSize).toBe(10)
			expect(batchNode?.params?.concurrency).toBe(2)

			// check edges
			expect(blueprint.edges).toHaveLength(2) // start->batch, batch->end
		})

		it('should generate a blueprint with a loop-controller node and continue/break edges for loop', () => {
			const flow = new Flow('test-flow')

			flow.node('start', 'start-func')
			flow.node('end', 'end-func')

			flow.loop('start', 'end', { maxIterations: 5, condition: 'counter < 10' })

			const blueprint = flow.toBlueprint()

			// should have 3 nodes: start, loop-controller, end
			expect(blueprint.nodes).toHaveLength(3)

			// find the loop node
			const loopNode = blueprint.nodes.find(n => n.uses === 'loop-controller')
			expect(loopNode).toBeDefined()
			expect(loopNode?.params?.maxIterations).toBe(5)
			expect(loopNode?.params?.condition).toBe('counter < 10')

			// check edges - should have start->loop, loop->end (continue), loop->end (break)
			expect(blueprint.edges).toHaveLength(3)
			const continueEdge = blueprint.edges.find(e => e.action === 'continue')
			const breakEdge = blueprint.edges.find(e => e.action === 'break')
			expect(continueEdge).toBeDefined()
			expect(breakEdge).toBeDefined()
		})

		it('should generate multiple conditional edges from a single source for condition', () => {
			const flow = new Flow('test-flow')

			flow.node('start', 'start-func')
			flow.node('success', 'success-func')
			flow.node('error', 'error-func')
			flow.node('default', 'default-func')

			flow.condition('start', [
				{ condition: 'status === "success"', target: 'success' },
				{ condition: 'status === "error"', target: 'error' },
			], 'default')

			const blueprint = flow.toBlueprint()

			// should have 4 nodes
			expect(blueprint.nodes).toHaveLength(4)

			// check edges - should have 3 edges from start
			const startEdges = blueprint.edges.filter(e => e.source === 'start')
			expect(startEdges).toHaveLength(3)

			const successEdge = startEdges.find(e => e.target === 'success')
			const errorEdge = startEdges.find(e => e.target === 'error')
			const defaultEdge = startEdges.find(e => e.target === 'default')

			expect(successEdge?.condition).toBe('status === "success"')
			expect(errorEdge?.condition).toBe('status === "error"')
			expect(defaultEdge?.condition).toBeUndefined()
		})
	})

	describe('metadata and validation', () => {
		it('should correctly add inputs, outputs, and metadata to the blueprint', () => {
			const flow = new Flow('test-flow')

			flow.node('dummy', async () => ({ output: null }))
			flow.inputs({ input1: 'string', input2: 'number' })
			flow.outputs({ output1: 'string', output2: 'object' })
			flow.metadata({ name: 'Test Flow', version: '1.0' })

			const blueprint = flow.toBlueprint()

			expect(blueprint.inputs).toEqual({ input1: 'string', input2: 'number' })
			expect(blueprint.outputs).toEqual({ output1: 'string', output2: 'object' })
			expect(blueprint.metadata?.name).toBe('Test Flow')
			expect(blueprint.metadata?.version).toBe('1.0')
		})

		it('should throw an error if an edge references a non-existent node', () => {
			const flow = new Flow('test-flow')

			flow.node('node1', 'func1')
			flow.edge('node1', 'nonexistent-node')

			expect(() => flow.toBlueprint()).toThrow('Target node \'nonexistent-node\' not found')
		})

		it('should throw an error if the workflow has no nodes', () => {
			const flow = new Flow('test-flow')

			expect(() => flow.toBlueprint()).toThrow('Workflow must have at least one node')
		})
	})

	describe('composition', () => {
		it('should create a deep copy of the blueprint and function registry for clone', () => {
			const flow = new Flow('original-flow')

			const testFunction = async () => ({ output: 'test' })
			flow.node('test-node', testFunction)
			flow.edge('test-node', 'test-node') // self-loop for testing

			const clonedFlow = flow.clone('cloned-flow')

			// original should be unchanged
			expect(flow.toBlueprint().id).toBe('original-flow')

			// clone should have new ID
			const clonedBlueprint = clonedFlow.toBlueprint()
			expect(clonedBlueprint.id).toBe('cloned-flow')

			// should have same structure but different object references
			expect(clonedFlow.toBlueprint().nodes).toHaveLength(1)
			expect(clonedFlow.toBlueprint().edges).toHaveLength(1)

			// function registry should be copied
			const originalRegistry = flow.getFunctionRegistry()
			const clonedRegistry = clonedFlow.getFunctionRegistry()
			expect(originalRegistry.size).toBe(1)
			expect(clonedRegistry.size).toBe(1)
		})

		it('should combine two blueprints, correctly prefixing node IDs and merging registries for merge', () => {
			const flow1 = new Flow('flow1')
			const testFunction1 = async () => ({ output: 'test1' })
			flow1.node('node1', testFunction1)

			const flow2 = new Flow('flow2')
			const testFunction2 = async () => ({ output: 'test2' })
			flow2.node('node2', testFunction2)

			flow1.merge(flow2, 'prefix')

			const blueprint = flow1.toBlueprint()

			// should have 2 nodes with prefixed IDs
			expect(blueprint.nodes).toHaveLength(2)
			expect(blueprint.nodes.map(n => n.id)).toContain('node1')
			expect(blueprint.nodes.map(n => n.id)).toContain('prefix_node2')

			// function registry should be merged
			const registry = flow1.getFunctionRegistry()
			expect(registry.size).toBe(2)
		})
	})

	describe('createFlow helper', () => {
		it('should create a flow using the helper function', () => {
			const metadata = { name: 'Helper Flow' }
			const flow = createFlow('helper-flow', metadata)

			flow.node('dummy', async () => ({ output: null }))
			expect(flow.toBlueprint().id).toBe('helper-flow')
			expect(flow.toBlueprint().metadata).toEqual(metadata)
		})
	})
})

import { describe, expect, it } from 'vitest'
import { createFlow, Flow } from './flow'
import { FlowcraftRuntime } from './runtime'

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

			const flow = new Flow('test-flow', undefined, metadata)
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
			const flow = createFlow('helper-flow', undefined, metadata)

			flow.node('dummy', async () => ({ output: null }))
			expect(flow.toBlueprint().id).toBe('helper-flow')
			expect(flow.toBlueprint().metadata).toEqual(metadata)
		})
	})

	describe('transform method', () => {
		it('should generate the correct number of intermediate nodes for a transform chain with 3 steps', () => {
			const flow = new Flow('test-flow')

			flow.node('start', async () => ({ output: { id: 1 } }))
			flow.node('end', async () => ({ output: null }))

			flow.transform('start', 'end', [
				input => ({ ...input, name: 'test' }),
				input => input.id > 0,
				input => console.log(input),
			])

			const blueprint = flow.toBlueprint()

			// Should have start, end, and 3 transform nodes
			expect(blueprint.nodes).toHaveLength(5)
			const transformNodes = blueprint.nodes.filter(n => n.id.startsWith('start_transform_'))
			expect(transformNodes).toHaveLength(3)
		})

		it('should correctly chain the intermediate nodes in a linear sequence', () => {
			const flow = new Flow('test-flow')

			flow.node('start', async () => ({ output: { id: 1 } }))
			flow.node('end', async () => ({ output: null }))

			flow.transform('start', 'end', [
				input => ({ ...input, name: 'test' }),
				input => input.id > 0,
			])

			const blueprint = flow.toBlueprint()

			// Check edges form a chain: start -> transform_0 -> transform_1 -> end
			const edges = blueprint.edges
			expect(edges).toHaveLength(3)
			expect(edges[0]).toEqual({ source: 'start', target: expect.stringMatching(/^start_transform_0_/) })
			expect(edges[1]).toEqual({ source: expect.stringMatching(/^start_transform_0_/), target: expect.stringMatching(/^start_transform_1_/) })
 			expect(edges[2]).toEqual({ source: expect.stringMatching(/^start_transform_1_/), target: 'end', condition: 'result !== undefined' })
		})

		it('should register anonymous functions in the function registry', () => {
			const flow = new Flow('test-flow')

			flow.node('start', async () => ({ output: { id: 1 } }))
			flow.node('end', async () => ({ output: null }))

			const mapFn = (input: any) => ({ ...input, name: 'test' })
			const filterFn = (input: any) => input.id > 0

			flow.transform('start', 'end', [mapFn, filterFn])

			const registry = flow.getFunctionRegistry()
			expect(registry.size).toBe(4) // start, end, and 2 transforms

			// Check that the nodes use the registry keys
			const blueprint = flow.toBlueprint()
			const transformNodes = blueprint.nodes.filter(n => n.id.startsWith('start_transform_'))
			expect(transformNodes[0].uses).toMatch(/^transform_start_transform_0_/)
			expect(transformNodes[1].uses).toMatch(/^transform_start_transform_1_/)
		})

		it('should handle an empty transform array by creating a direct edge', () => {
			const flow = new Flow('test-flow')

			flow.node('start', async () => ({ output: { id: 1 } }))
			flow.node('end', async () => ({ output: null }))

			flow.transform('start', 'end', [])

			const blueprint = flow.toBlueprint()

			// Should have only start and end nodes
			expect(blueprint.nodes).toHaveLength(2)
			// Should have one direct edge
			expect(blueprint.edges).toHaveLength(1)
			expect(blueprint.edges[0]).toEqual({ source: 'start', target: 'end' })
		})
	})

	describe('integration tests', () => {
		it('should execute a full map-tap-filter-map pipeline correctly', async () => {
			const flow = new Flow('test-flow')

			flow.node('start', async () => ({ output: { id: 1, name: ' test user ', status: 'active' } }))
			flow.node('end', async (context) => {
				const input = context.input
				return { output: `Processed: ${input.name} (${input.id})` }
			})

			flow.transform('start', 'end', [
				input => ({ ...input, name: input.name.trim() }), // map
				input => input.status === 'active', // filter (should pass)
				input => console.log(`Processing active user: ${input.id}`), // tap
				input => ({ name: input.name.toUpperCase(), id: input.id }), // map
			])

			const blueprint = flow.toBlueprint()
			const runtime = new FlowcraftRuntime({ registry: {} })
			const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

			expect(result.metadata.status).toBe('completed')
			expect(result.context.end).toBe('Processed: TEST USER (1)')
		})

		it('should terminate the chain when a filter returns false', async () => {
			const flow = new Flow('test-flow')

			flow.node('start', async () => ({ output: { id: 1, name: 'user', status: 'inactive' } }))
			flow.node('end', async () => ({ output: 'Should not reach here' }))

			flow.transform('start', 'end', [
				input => ({ ...input, name: input.name.trim() }),
				input => input.status === 'active', // filter (should fail)
				input => ({ name: input.name.toUpperCase(), id: input.id }), // should not execute
			])

			const blueprint = flow.toBlueprint()
			const runtime = new FlowcraftRuntime({ registry: {} })

			const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())

			// Since filter fails, the next nodes should not be executed
			expect(result.context.end).toBeUndefined()
		})

		it('should fail the entire workflow if a transform function throws an error', async () => {
			const flow = new Flow('test-flow')

			flow.node('start', async () => ({ output: { id: 1 } }))
			flow.node('end', async () => ({ output: 'Should not reach here' }))

			flow.transform('start', 'end', [
				_input => ({ ..._input, name: 'test' }),
				(_input) => { throw new Error('Transform error') }, // error in map
			])

			const blueprint = flow.toBlueprint()
			const runtime = new FlowcraftRuntime({ registry: {} })

			await expect(runtime.run(blueprint, {}, flow.getFunctionRegistry())).rejects.toThrow('Transform error')
		})
	})
})

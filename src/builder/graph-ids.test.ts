import type { BuildResult, NodeConstructorOptions, NodeTypeMap, TypedWorkflowGraph, WorkflowGraph } from './graph.types'
import { beforeEach, describe, expect, it } from 'vitest'
import { Node } from '../workflow'
import { createNodeRegistry, GraphBuilder } from './graph'

class TestNode extends Node {
	constructor(_options: NodeConstructorOptions<any, any>) {
		super()
	}
}

interface MockRegistry {
	graphs: Map<number, WorkflowGraph>
	getGraph: (id: number) => WorkflowGraph | undefined
}

interface TestBuilderContext {
	registry: MockRegistry
}

const mockRegistry: MockRegistry = {
	graphs: new Map<number, WorkflowGraph>(),
	getGraph(id: number): WorkflowGraph | undefined {
		return this.graphs.get(id)
	},
}

interface TestNodeTypeMap extends NodeTypeMap {
	'step': Record<string, never>
	'sub-workflow': {
		workflowId: number
		inputs: Record<string, string>
		outputs: Record<string, string>
	}
}

const testNodeRegistry = createNodeRegistry<TestNodeTypeMap, TestBuilderContext>({
	'step': TestNode,
	'sub-workflow': TestNode,
})

describe('graphBuilder with Sub-Workflows: ID and Predecessor Mapping', () => {
	let parentGraph: TypedWorkflowGraph<TestNodeTypeMap>
	let builder: GraphBuilder<TestNodeTypeMap, TestBuilderContext>
	let buildResult: BuildResult

	beforeEach(() => {
		mockRegistry.graphs.clear()

		const subWorkflowGraph: TypedWorkflowGraph<TestNodeTypeMap> = {
			nodes: [
				{ id: 'sub-step-1', type: 'step', data: {} },
				{ id: 'sub-step-2', type: 'step', data: {} },
			],
			edges: [{ source: 'sub-step-1', target: 'sub-step-2' }],
		}
		mockRegistry.graphs.set(101, subWorkflowGraph)

		parentGraph = {
			nodes: [
				{ id: 'start', type: 'step', data: {} },
				{ id: 'parallel-branch', type: 'step', data: {} },
				{
					id: 'sub-container',
					type: 'sub-workflow',
					data: {
						workflowId: 101,
						inputs: {},
						outputs: {},
					},
				},
				{ id: 'end', type: 'step', data: {} },
			],
			edges: [
				{ source: 'start', target: 'sub-container' },
				{ source: 'start', target: 'parallel-branch' }, // Fan-out from start
				{ source: 'sub-container', target: 'end' }, // Fan-in to end
				{ source: 'parallel-branch', target: 'end' }, // Fan-in to end
			],
		}

		builder = new GraphBuilder(
			testNodeRegistry,
			{ registry: mockRegistry },
			{ subWorkflowNodeTypes: ['sub-workflow'] },
		)

		buildResult = builder.build(parentGraph)
	})

	it('should correctly assign originalId to all nodes', () => {
		const { nodeMap } = buildResult

		const getOriginalId = (namespacedId: string): string | undefined => {
			return nodeMap.get(namespacedId)?.graphData?.data?.originalId ?? undefined
		}

		// Test top-level nodes
		expect(getOriginalId('start')).toBe('start')
		expect(getOriginalId('parallel-branch')).toBe('parallel-branch')
		expect(getOriginalId('end')).toBe('end')

		// Test inlined sub-workflow nodes
		expect(getOriginalId('sub-container:sub-step-1')).toBe('sub-step-1')
		expect(getOriginalId('sub-container:sub-step-2')).toBe('sub-step-2')

		//  Test the crucial mapper nodes
		expect(getOriginalId('sub-container_input_mapper')).toBe('sub-container')
		expect(getOriginalId('sub-container_output_mapper')).toBe('sub-container')
	})

	it('should generate a correct predecessorIdMap with fully namespaced IDs', () => {
		const { predecessorIdMap } = buildResult

		// Test a node with a single, simple predecessor
		expect(predecessorIdMap.get('parallel-branch')).toEqual(['start'])

		// Test the start of the sub-workflow
		expect(predecessorIdMap.get('sub-container:sub-step-1')).toEqual(['sub-container_input_mapper'])

		// Test a node inside the sub-workflow
		expect(predecessorIdMap.get('sub-container:sub-step-2')).toEqual(['sub-container:sub-step-1'])

		// Test the output mapper
		expect(predecessorIdMap.get('sub-container_output_mapper')).toEqual(['sub-container:sub-step-2'])

		// Test the fan-in node
		const endPredecessors = predecessorIdMap.get('end')
		expect(endPredecessors).toBeDefined()
		expect(endPredecessors).toHaveLength(2)
		expect(endPredecessors).toEqual(expect.arrayContaining([
			'sub-container_output_mapper',
			'parallel-branch',
		]))
	})

	it('should generate a correct originalPredecessorIdMap with original IDs', () => {
		const { originalPredecessorIdMap } = buildResult

		// Test a node with a single, simple predecessor
		expect(originalPredecessorIdMap.get('parallel-branch')).toEqual(['start'])

		// Test the start of the sub-workflow
		expect(originalPredecessorIdMap.get('sub-container:sub-step-1')).toEqual(['sub-container'])

		// Test a node inside the sub-workflow
		expect(originalPredecessorIdMap.get('sub-container:sub-step-2')).toEqual(['sub-step-1'])

		// Test the output mapper
		expect(originalPredecessorIdMap.get('sub-container_output_mapper')).toEqual(['sub-step-2'])

		// Test the fan-in node
		const endOriginalPredecessors = originalPredecessorIdMap.get('end')
		expect(endOriginalPredecessors).toBeDefined()
		expect(endOriginalPredecessors).toHaveLength(2)
		expect(endOriginalPredecessors).toEqual(expect.arrayContaining([
			'sub-container',
			'parallel-branch',
		]))
	})
})

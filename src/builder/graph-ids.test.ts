import type { BuildResult, NodeConstructorOptions, NodeTypeMap, SubWorkflowResolver, TypedWorkflowGraph, WorkflowGraph } from './graph.types'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ACTION } from '../types'
import { Node } from '../workflow'
import { createNodeRegistry, GraphBuilder } from './graph'
import { ParallelFlow } from './patterns'

class TestNode extends Node {
	constructor(_options: NodeConstructorOptions<any, any>) {
		super()
	}
}

interface MockRegistry extends SubWorkflowResolver {
	graphs: Map<number, WorkflowGraph>
	getGraph: (id: number | string) => WorkflowGraph | undefined
}

const mockRegistry: MockRegistry = {
	graphs: new Map<number, WorkflowGraph>(),
	getGraph(id: number | string): WorkflowGraph | undefined {
		if (typeof id !== 'number')
			return undefined

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

const testNodeRegistry = createNodeRegistry<TestNodeTypeMap>({
	'step': TestNode,
	'sub-workflow': TestNode,
})

describe('graphBuilder with Sub-Workflows: ID and Predecessor Mapping', () => {
	let parentGraph: TypedWorkflowGraph<TestNodeTypeMap>
	let builder: GraphBuilder<TestNodeTypeMap>
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
			{},
			{
				subWorkflowNodeTypes: ['sub-workflow'],
				subWorkflowResolver: mockRegistry,
			},
		)

		buildResult = builder.build(parentGraph)
	})

	it('should correctly assign originalId to all nodes', () => {
		const { nodeMap } = buildResult

		const getOriginalId = (namespacedId: string): string | undefined => {
			return nodeMap.get(namespacedId)?.graphData?.data?.originalId ?? undefined
		}

		expect(getOriginalId('start')).toBe('start')
		expect(getOriginalId('parallel-branch')).toBe('parallel-branch')
		expect(getOriginalId('end')).toBe('end')
		expect(getOriginalId('sub-container:sub-step-1')).toBe('sub-step-1')
		expect(getOriginalId('sub-container:sub-step-2')).toBe('sub-step-2')
		expect(getOriginalId('subcontainer_input_mapper')).toBe('sub-container')
		expect(getOriginalId('subcontainer_output_mapper')).toBe('sub-container')
	})

	it('should generate a correct predecessorIdMap with fully namespaced IDs', () => {
		const { predecessorIdMap } = buildResult
		expect(predecessorIdMap.get('parallel-branch')).toEqual(['start'])
		expect(predecessorIdMap.get('sub-container:sub-step-1')).toEqual(['subcontainer_input_mapper'])
		expect(predecessorIdMap.get('sub-container:sub-step-2')).toEqual(['sub-container:sub-step-1'])
		expect(predecessorIdMap.get('subcontainer_output_mapper')).toEqual(['sub-container:sub-step-2'])

		const endPredecessors = predecessorIdMap.get('end')
		expect(endPredecessors).toBeDefined()
		expect(endPredecessors).toHaveLength(2)
		expect(endPredecessors).toEqual(expect.arrayContaining([
			'subcontainer_output_mapper',
			'parallel-branch',
		]))
	})

	it('should generate a correct originalPredecessorIdMap with original IDs', () => {
		const { originalPredecessorIdMap } = buildResult
		expect(originalPredecessorIdMap.get('parallel-branch')).toEqual(['start'])
		expect(originalPredecessorIdMap.get('sub-step-1')).toEqual(['sub-container'])
		expect(originalPredecessorIdMap.get('sub-step-2')).toEqual(['sub-step-1'])
		expect(originalPredecessorIdMap.get('sub-container')).toEqual(
			expect.arrayContaining(['sub-step-2']),
		)

		const endOriginalPredecessors = originalPredecessorIdMap.get('end')
		expect(endOriginalPredecessors).toBeDefined()
		expect(endOriginalPredecessors).toHaveLength(2)
		expect(endOriginalPredecessors).toEqual(expect.arrayContaining([
			'sub-container',
			'parallel-branch',
		]))
	})

	it('should wire the parallel container to the convergence node', () => {
		const { nodeMap } = buildResult

		const startNode = nodeMap.get('start')!
		const parallelContainer = startNode.successors.get(DEFAULT_ACTION)
		const endNode = nodeMap.get('end')!

		// 1. The direct successor of the fan-out node MUST be the ParallelFlow container.
		expect(parallelContainer).toBeInstanceOf(ParallelFlow)

		// 2. The direct successor of the ParallelFlow container MUST be the convergence node.
		expect(parallelContainer!.successors.get(DEFAULT_ACTION)).toBe(endNode)
	})
})

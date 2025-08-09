import type { NodeArgs } from '../../types'
import type { TypedWorkflowGraph, WorkflowBlueprint } from './types'
import { describe, expect, it } from 'vitest'
import { contextKey, TypedContext } from '../../context'
import { Node } from '../../workflow'
import { createNodeRegistry, GraphBuilder } from './graph'
import { ParallelBranchContainer } from './internal-nodes'
import { BlueprintExecutor } from './runner'

const VALUE = contextKey<number>('value')
const PATH = contextKey<string[]>('path')

class SetNode extends Node {
	constructor(private opts: { data: { value: number } }) { super() }
	async exec({ ctx }: NodeArgs) {
		ctx.set(VALUE, this.opts.data.value)
		const p = ctx.get(PATH) ?? []
		ctx.set(PATH, [...p, 'set'])
	}
}

class AddNode extends Node {
	constructor(private opts: { data: { value: number } }) { super() }
	async exec({ ctx }: NodeArgs) {
		const current = ctx.get(VALUE) ?? 0
		ctx.set(VALUE, current + this.opts.data.value)
		const p = ctx.get(PATH) ?? []
		ctx.set(PATH, [...p, 'add'])
	}
}

class PathLogNode extends Node {
	constructor(private opts: { data: { id: string } }) { super() }
	async exec({ ctx }: NodeArgs) {
		const p = ctx.get(PATH) ?? []
		ctx.set(PATH, [...p, this.opts.data.id])
	}
}

class BranchNode extends Node<void, void, 'a' | 'b'> {
	constructor(private opts: { data: { path: 'a' | 'b' } }) { super() }
	async post() { return this.opts.data.path }
}

const testRegistry = createNodeRegistry({
	set: SetNode,
	add: AddNode,
	log: PathLogNode,
	branch: BranchNode,
})

describe('BlueprintExecutor', () => {
	it('should correctly hydrate a blueprint and execute the resulting flow', async () => {
		const blueprint: WorkflowBlueprint = {
			nodes: [
				{ id: 'start', type: 'set', data: { value: 10 } },
				{ id: 'add-5', type: 'add', data: { value: 5 } },
			],
			edges: [
				{ source: 'start', target: 'add-5' },
			],
			startNodeId: 'start',
			predecessorCountMap: {
				'start': 0,
				'add-5': 1,
			},
			originalPredecessorIdMap: {
				'add-5': ['start'],
			},
		}

		const executor = new BlueprintExecutor(blueprint, testRegistry)

		expect(executor.nodeMap.has('start')).toBe(true)
		expect(executor.nodeMap.has('add-5')).toBe(true)
		expect(executor.flow.startNode).toBe(executor.nodeMap.get('start'))
		const startNode = executor.nodeMap.get('start')!
		const addNode = executor.nodeMap.get('add-5')!
		expect(Array.from(startNode.successors.values())[0][0]).toBe(addNode)

		const ctx = new TypedContext()
		await executor.run(executor.flow, ctx)

		expect(ctx.get(VALUE)).toBe(15)
		expect(ctx.get(PATH)).toEqual(['set', 'add'])
	})

	it('should return a specific node instance via getNode()', () => {
		const blueprint: WorkflowBlueprint = {
			nodes: [{ id: 'node-a', type: 'set', data: { value: 1 } }],
			edges: [],
			startNodeId: 'node-a',
			predecessorCountMap: {},
			originalPredecessorIdMap: {},
		}

		const executor = new BlueprintExecutor(blueprint, testRegistry)
		const nodeA = executor.getNode('node-a')

		expect(nodeA).toBeDefined()
		expect(nodeA).toBeInstanceOf(SetNode)
		expect(nodeA!.id).toBe('node-a')
	})

	it('should throw an error for a blueprint with an invalid startNodeId', () => {
		const blueprint: WorkflowBlueprint = {
			nodes: [{ id: 'node-a', type: 'set', data: { value: 1 } }],
			edges: [],
			startNodeId: 'invalid-start-id',
			predecessorCountMap: {},
			originalPredecessorIdMap: {},
		}

		expect(() => new BlueprintExecutor(blueprint, testRegistry)).toThrow(
			/Blueprint start node with ID 'invalid-start-id' not found/,
		)
	})

	it('should throw an error if a node type is not in the registry', () => {
		const blueprint: WorkflowBlueprint = {
			nodes: [{ id: 'node-a', type: 'unknown-type', data: {} }],
			edges: [],
			startNodeId: 'node-a',
			predecessorCountMap: {},
			originalPredecessorIdMap: {},
		}

		expect(() => new BlueprintExecutor(blueprint, testRegistry)).toThrow(
			/Node type 'unknown-type' not found in registry/,
		)
	})
})

describe('BlueprintExecutor parallel container hydration', () => {
	it('should correctly populate the nodesToRun property on ParallelBranchContainer instances', () => {
		const graph: TypedWorkflowGraph<any> = {
			nodes: [
				{ id: 'start', type: 'set', data: { value: 0 } },
				{ id: 'a', type: 'add', data: { value: 1 } },
				{ id: 'b', type: 'add', data: { value: 10 } },
			],
			edges: [
				{ source: 'start', target: 'a' },
				{ source: 'start', target: 'b' },
			],
		}
		const builder = new GraphBuilder(testRegistry, {}, { conditionalNodeTypes: [] })
		const { blueprint } = builder.buildBlueprint(graph)
		const executor = new BlueprintExecutor(blueprint, testRegistry)

		const containerId = 'start__parallel_container'
		const containerNode = executor.getNode(containerId)

		expect(containerNode).toBeDefined()
		expect(containerNode).toBeInstanceOf(ParallelBranchContainer)

		const parallelContainer = containerNode as ParallelBranchContainer
		expect(parallelContainer.nodesToRun).toBeInstanceOf(Array)
		expect(parallelContainer.nodesToRun).toHaveLength(2)

		const branchIds = parallelContainer.nodesToRun.map(n => n.id)
		expect(branchIds).toEqual(expect.arrayContaining(['a', 'b']))
	})
})

describe('BlueprintExecutor with conditional convergence', () => {
	it('should insert a join node so the convergence point has a predecessor count of 1', () => {
		const graph: TypedWorkflowGraph<any> = {
			nodes: [
				{ id: 'start', type: 'branch', data: { path: 'a' } },
				{ id: 'path-a', type: 'log', data: { id: 'A' } },
				{ id: 'path-b', type: 'log', data: { id: 'B' } },
				{ id: 'converge', type: 'log', data: { id: 'C' } },
			],
			edges: [
				{ source: 'start', target: 'path-a', action: 'a' },
				{ source: 'start', target: 'path-b', action: 'b' },
				{ source: 'path-a', target: 'converge' },
				{ source: 'path-b', target: 'converge' },
			],
		}
		const builder = new GraphBuilder(testRegistry, {}, {
			conditionalNodeTypes: ['branch'],
		})
		const { blueprint } = builder.buildBlueprint(graph)
		expect(blueprint.predecessorCountMap.converge).toBe(1)

		const joinNodeId = 'start__conditional_join'
		expect(blueprint.nodes.some(n => n.id === joinNodeId)).toBe(true)
		expect(blueprint.originalPredecessorIdMap.converge).toEqual([joinNodeId])
	})
})

describe('BlueprintExecutor with parallel start nodes', () => {
	it('should create a root parallel container for graphs with multiple start nodes', () => {
		const graph: TypedWorkflowGraph<any> = {
			nodes: [
				{ id: 'start-a', type: 'log', data: { id: 'A' } },
				{ id: 'start-b', type: 'log', data: { id: 'B' } },
				{ id: 'end', type: 'log', data: { id: 'C' } },
			],
			edges: [
				{ source: 'start-a', target: 'end' },
				{ source: 'start-b', target: 'end' },
			],
		}
		const builder = new GraphBuilder(testRegistry)
		const { blueprint } = builder.buildBlueprint(graph)

		expect(blueprint.startNodeId).toBe('__root_parallel_start')

		const rootNode = blueprint.nodes.find(n => n.id === '__root_parallel_start')
		expect(rootNode).toBeDefined()
		expect(rootNode!.type).toBe('__internal_parallel_container__')

		const rootEdges = blueprint.edges.filter(e => e.source === '__root_parallel_start')
		expect(rootEdges).toHaveLength(2)
		const rootTargets = rootEdges.map(e => e.target)
		expect(rootTargets).toEqual(expect.arrayContaining(['start-a', 'start-b']))
	})
})

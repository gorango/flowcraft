import type { Logger } from '../logger'
import type { NodeArgs, RunOptions } from '../types'
import type { AbstractNode } from '../workflow'
import type { NodeConstructorOptions, NodeRegistry, NodeTypeMap, SubWorkflowResolver, TypedNodeRegistry, TypedWorkflowGraph, WorkflowGraph } from './graph.types'
import { describe, expect, it, vi } from 'vitest'
import { contextKey, TypedContext } from '../context'
import { DEFAULT_ACTION } from '../types'
import { Node } from '../workflow'
import { createNodeRegistry, GraphBuilder } from './graph'
import { ParallelFlow } from './patterns'

function createMockLogger(): Logger {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}
}

const mockLogger = createMockLogger()
const runOptions: RunOptions = { logger: mockLogger }

describe('graphBuilder', () => {
	const VALUE = contextKey<number>('value')
	const PATH = contextKey<string[]>('path')

	interface TestNodeTypeMap {
		set: { value: number }
		add: { value: number }
		branch: { threshold: number }
		logPath: { id: string }
		configurable: Record<string, never>
	}

	class SetValueNode extends Node {
		private value: number
		constructor(options: NodeConstructorOptions<TestNodeTypeMap['set']>) {
			super()
			this.value = options.data.value
		}

		async prep({ ctx }: NodeArgs) {
			ctx.set(VALUE, this.value)
		}
	}

	class AddValueNode extends Node {
		private valueToAdd: number
		constructor(options: NodeConstructorOptions<TestNodeTypeMap['add']>) {
			super()
			this.valueToAdd = options.data.value
		}

		async prep({ ctx }: NodeArgs) {
			const current = ctx.get(VALUE) ?? 0
			ctx.set(VALUE, current + this.valueToAdd)
		}
	}

	class ConditionalBranchNode extends Node<void, void, string> {
		private threshold: number
		constructor(options: NodeConstructorOptions<TestNodeTypeMap['branch']>) {
			super()
			this.threshold = options.data.threshold
		}

		async post({ ctx }: NodeArgs) {
			const current = ctx.get(VALUE) ?? 0
			return current > this.threshold ? 'over' : 'under'
		}
	}

	class LogPathNode extends Node {
		private pathId: string
		constructor(options: NodeConstructorOptions<TestNodeTypeMap['logPath']>) {
			super()
			this.pathId = options.data.id
		}

		async prep({ ctx }: NodeArgs) {
			const currentPath = ctx.get(PATH) ?? []
			ctx.set(PATH, [...currentPath, this.pathId])
		}
	}

	class ConfigurableNode extends Node { }

	const testRegistry = createNodeRegistry({
		set: SetValueNode,
		add: AddValueNode,
		branch: ConditionalBranchNode,
		logPath: LogPathNode,
		configurable: ConfigurableNode,
	})

	it('should build and run a complex graph with parallel fan-out', async () => {
		const graph: TypedWorkflowGraph<TestNodeTypeMap> = {
			nodes: [
				{ id: 'start', type: 'set', data: { value: 10 } },
				{ id: 'brancher', type: 'branch', data: { threshold: 15 } },
				{ id: 'add-10', type: 'add', data: { value: 10 } },
				{ id: 'log-A', type: 'logPath', data: { id: 'path_A' } }, // Parallel branch 1
				{ id: 'log-B', type: 'logPath', data: { id: 'path_B' } }, // Parallel branch 2
				{ id: 'final', type: 'add', data: { value: 1000 } },
				// TRY THIS: Uncomment the lines below. TypeScript will throw an error!
				// { id: 'error-test', type: 'add', data: { threshold: 99 } },
				// { id: 'error-test', type: 'add', data: { WRONG_PROP: 99 } },
			],
			edges: [
				{ source: 'start', target: 'brancher' },
				{ source: 'brancher', target: 'add-10', action: 'under' },
				// Fan-out from 'add-10'
				{ source: 'add-10', target: 'log-A' },
				{ source: 'add-10', target: 'log-B' },
				// Fan-in to 'final'
				{ source: 'log-A', target: 'final' },
				{ source: 'log-B', target: 'final' },
			],
		}

		const builder = new GraphBuilder(testRegistry)
		const { flow } = builder.build(graph)
		const ctx = new TypedContext()
		await flow.run(ctx, runOptions)
		expect(ctx.get(VALUE)).toBe(1020)
		const path = ctx.get(PATH)
		expect(path).toBeDefined()
		expect(path).toHaveLength(2)
		expect(path).toEqual(expect.arrayContaining(['path_A', 'path_B']))
	})

	it('should correctly generate the predecessorIdMap and predecessorCountMap', () => {
		const graph: TypedWorkflowGraph<TestNodeTypeMap> = {
			nodes: [
				{ id: 'start', type: 'set', data: { value: 10 } },
				{ id: 'task-a', type: 'add', data: { value: 1 } },
				{ id: 'task-b', type: 'add', data: { value: 2 } },
				{ id: 'join', type: 'add', data: { value: 3 } },
			],
			edges: [
				{ source: 'start', target: 'task-a' },
				{ source: 'start', target: 'task-b' },
				{ source: 'task-a', target: 'join' },
				{ source: 'task-b', target: 'join' },
			],
		}

		const builder = new GraphBuilder(testRegistry)
		const { predecessorIdMap, predecessorCountMap } = builder.build(graph)

		expect(predecessorIdMap.get('start')).toBeUndefined()
		expect(predecessorIdMap.get('task-a')).toEqual(['start'])
		expect(predecessorIdMap.get('task-b')).toEqual(['start'])
		const joinPredecessors = predecessorIdMap.get('join')
		expect(joinPredecessors).toBeDefined()
		expect(joinPredecessors).toHaveLength(2)
		expect(joinPredecessors).toEqual(expect.arrayContaining(['task-a', 'task-b']))

		expect(predecessorCountMap.get('start')).toBe(0)
		expect(predecessorCountMap.get('task-a')).toBe(1)
		expect(predecessorCountMap.get('task-b')).toBe(1)
		expect(predecessorCountMap.get('join')).toBe(2)
	})

	it('should apply retry options from the graph node config block', () => {
		const graphWithConfig: TypedWorkflowGraph<TestNodeTypeMap> = {
			nodes: [
				{
					id: 'node-with-config',
					type: 'configurable',
					data: {},
					config: { maxRetries: 5, wait: 100 },
				},
				{ id: 'node-without-config', type: 'configurable', data: {} },
			],
			edges: [],
		}

		const builder = new GraphBuilder(testRegistry, {}, {}, mockLogger)
		const { nodeMap } = builder.build(graphWithConfig)

		const configuredNode = nodeMap.get('node-with-config') as Node
		const unconfiguredNode = nodeMap.get('node-without-config') as Node

		expect(configuredNode).toBeInstanceOf(Node)
		expect(configuredNode.maxRetries).toBe(5)
		expect(configuredNode.wait).toBe(100)

		expect(unconfiguredNode).toBeInstanceOf(Node)
		// Should have default values
		expect(unconfiguredNode.maxRetries).toBe(1)
		expect(unconfiguredNode.wait).toBe(0)
	})
})

describe('graphBuilder (no type safety)', () => {
	const VALUE = contextKey<number>('value')
	const PATH = contextKey<string[]>('path')

	class SetValueNode extends Node {
		private value: number
		constructor(options: { data: { value: number } }) {
			super()
			this.value = options.data.value
		}

		async prep({ ctx }: NodeArgs) { ctx.set(VALUE, this.value) }
	}

	class AddValueNode extends Node {
		private valueToAdd: number
		constructor(options: { data: { value: number } }) {
			super()
			this.valueToAdd = options.data.value
		}

		async prep({ ctx }: NodeArgs) {
			const current = ctx.get(VALUE) ?? 0
			ctx.set(VALUE, current + this.valueToAdd)
		}
	}

	class ConditionalBranchNode extends Node<void, void, string> {
		private threshold: number
		constructor(options: { data: { threshold: number } }) {
			super()
			this.threshold = options.data.threshold
		}

		async post({ ctx }: NodeArgs) {
			const current = ctx.get(VALUE) ?? 0
			return current > this.threshold ? 'over' : 'under'
		}
	}

	class LogPathNode extends Node {
		private pathId: string
		constructor(options: { data: { id: string } }) {
			super()
			this.pathId = options.data.id
		}

		async prep({ ctx }: NodeArgs) {
			const currentPath = ctx.get(PATH) ?? []
			ctx.set(PATH, [...currentPath, this.pathId])
		}
	}

	const testRegistry: NodeRegistry = new Map<string, new (...args: any[]) => AbstractNode>([
		['set', SetValueNode],
		['add', AddValueNode],
		['branch', ConditionalBranchNode],
		['logPath', LogPathNode],
	])

	it('should build and run a simple graph using the untyped API', async () => {
		const graph: WorkflowGraph = {
			nodes: [
				{ id: 'start', type: 'set', data: { value: 10 } },
				{ id: 'brancher', type: 'branch', data: { threshold: 15 } },
				{ id: 'add-10', type: 'add', data: { value: 10 } },
				{ id: 'log-A', type: 'logPath', data: { id: 'path_A' } },
				{ id: 'log-B', type: 'logPath', data: { id: 'path_B' } },
				{ id: 'final', type: 'add', data: { value: 1000 } },
			],
			edges: [
				{ source: 'start', target: 'brancher' },
				{ source: 'brancher', target: 'add-10', action: 'under' },
				{ source: 'add-10', target: 'log-A' },
				{ source: 'add-10', target: 'log-B' },
				{ source: 'log-A', target: 'final' },
				{ source: 'log-B', target: 'final' },
			],
		}
		const builder = new GraphBuilder(testRegistry)
		const { flow } = builder.build(graph)
		const ctx = new TypedContext()
		await flow.run(ctx)
		expect(ctx.get(VALUE)).toBe(1020)
		const path = ctx.get(PATH)
		expect(path).toBeDefined()
		expect(path).toHaveLength(2)
		expect(path).toEqual(expect.arrayContaining(['path_A', 'path_B']))
	})
})

describe('graphBuilder with sub-workflows', () => {
	interface TestSubWorkflowNodeTypeMap {
		append: { value: string }
		final: Record<string, never>
		custom_sub_workflow: {
			workflowId: number
			inputs: Record<string, string>
			outputs: Record<string, string>
		}
	}

	const PARENT_VALUE = contextKey<string>('parent_value')
	const SUB_VALUE = contextKey<string>('sub_value')
	const FINAL_VALUE = contextKey<string>('final_value')

	class AppendStringNode extends Node {
		private str: string
		constructor(options: NodeConstructorOptions<TestSubWorkflowNodeTypeMap['append']>) {
			super()
			this.str = options.data.value
		}

		async exec({ prepRes }: NodeArgs<string>): Promise<string> {
			return `${prepRes} -> ${this.str}`
		}

		async prep({ ctx }: NodeArgs): Promise<string> {
			return ctx.get(SUB_VALUE) ?? ctx.get(PARENT_VALUE) ?? 'start'
		}

		async post({ ctx, execRes }: NodeArgs<string, string>) {
			const key = ctx.has(SUB_VALUE) ? SUB_VALUE : PARENT_VALUE
			ctx.set(key, execRes)
		}
	}

	class FinalOutputNode extends Node {
		constructor(_options: NodeConstructorOptions<TestSubWorkflowNodeTypeMap['final']>) {
			super()
		}

		async prep({ ctx }: NodeArgs) {
			const subResult = ctx.get(PARENT_VALUE) ?? ''
			ctx.set(FINAL_VALUE, `final: ${subResult}`)
		}
	}

	const mockSubWorkflowResolver: SubWorkflowResolver & { graphs: Map<number, WorkflowGraph> } = {
		graphs: new Map<number, WorkflowGraph>([
			[200, {
				nodes: [
					{ id: 'step_d', type: 'append', data: { value: 'D' } },
					{ id: 'step_e', type: 'append', data: { value: 'E' } },
				],
				edges: [{ source: 'step_d', target: 'step_e' }],
			}],
			[201, {
				nodes: [{ id: 'step_f', type: 'append', data: { value: 'F' } }],
				edges: [],
			}],
		]),
		getGraph(id: number | string) {
			if (typeof id !== 'number')
				return undefined

			return this.graphs.get(id)
		},
	}

	const subWorkflowNodeRegistry = createNodeRegistry({
		append: AppendStringNode,
		final: FinalOutputNode,
	})

	it('should correctly inline a sub-workflow and run the flattened graph', async () => {
		const parentGraph: TypedWorkflowGraph<TestSubWorkflowNodeTypeMap> = {
			nodes: [
				{ id: 'step_a', type: 'append', data: { value: 'A' } },
				{
					id: 'the_sub',
					type: 'custom_sub_workflow',
					data: {
						workflowId: 200,
						inputs: { sub_value: 'parent_value' },
						outputs: { parent_value: 'sub_value' },
					},
				},
				{ id: 'step_c', type: 'final', data: {} },
			],
			edges: [
				{ source: 'step_a', target: 'the_sub' },
				{ source: 'the_sub', target: 'step_c' },
			],
		}

		const builder = new GraphBuilder(subWorkflowNodeRegistry, {}, {
			subWorkflowNodeTypes: ['custom_sub_workflow'],
			subWorkflowResolver: mockSubWorkflowResolver,
		})

		const { flow, nodeMap } = builder.build(parentGraph)
		const ctx = new TypedContext([
			[PARENT_VALUE, 'start'],
		])

		await flow.run(ctx, runOptions)

		// The end-to-end result should be the same, proving the wiring is correct.
		expect(ctx.get(FINAL_VALUE)).toBe('final: start -> A -> D -> E')

		// Verify that the graph was flattened as expected.
		const containerNode = nodeMap.get('the_sub')
		expect(containerNode).toBeDefined()
		// It should be a passthrough container, not a SubWorkflowFlow
		expect(containerNode?.isPassthrough).toBe(true)

		// Verify the nodeMap now contains the internal, flattened nodes with namespaced IDs.
		expect(nodeMap.has('the_sub:step_d')).toBe(true)
		expect(nodeMap.has('the_sub_input_mapper')).toBe(true)
		expect(nodeMap.has('the_sub_output_mapper')).toBe(true)

		// Verify the `isSubWorkflow` data flag is set on internal nodes for debugging/UI.
		const subNodeD = nodeMap.get('the_sub:step_d')
		expect((subNodeD?.graphData?.data as any)?.isSubWorkflow).toBe(true)
	})

	it('should correctly inline a chain of sub-workflows', async () => {
		const parentGraph: TypedWorkflowGraph<TestSubWorkflowNodeTypeMap> = {
			nodes: [
				{ id: 'step_a', type: 'append', data: { value: 'A' } },
				{
					id: 'sub_1',
					type: 'custom_sub_workflow',
					data: {
						workflowId: 200, // Contains D -> E
						inputs: { sub_value: 'parent_value' },
						outputs: { parent_value: 'sub_value' },
					},
				},
				{
					id: 'sub_2',
					type: 'custom_sub_workflow',
					data: {
						workflowId: 201, // Contains F
						inputs: { sub_value: 'parent_value' },
						outputs: { parent_value: 'sub_value' },
					},
				},
				{ id: 'step_c', type: 'final', data: {} },
			],
			edges: [
				{ source: 'step_a', target: 'sub_1' },
				{ source: 'sub_1', target: 'sub_2' },
				{ source: 'sub_2', target: 'step_c' },
			],
		}

		const builder = new GraphBuilder(subWorkflowNodeRegistry, {}, {
			subWorkflowNodeTypes: ['custom_sub_workflow'],
			subWorkflowResolver: mockSubWorkflowResolver,
		})

		const { flow } = builder.build(parentGraph)
		const ctx = new TypedContext([
			[PARENT_VALUE, 'start'],
		])

		await flow.run(ctx, runOptions)

		// The end-to-end result should reflect the full chain: A -> (D->E) -> F -> C
		expect(ctx.get(FINAL_VALUE)).toBe('final: start -> A -> D -> E -> F')
	})

	it('should throw an error if a node with workflowId is not a registered sub-workflow type', () => {
		const graphWithUndeclaredSub: TypedWorkflowGraph<TestSubWorkflowNodeTypeMap> = {
			nodes: [
				{ id: 'step_a', type: 'append', data: { value: 'A' } },
				// This node has a `workflowId` but its type ('some_other_type') isn't in our list.
				// Note: We cast to `any` because TS would correctly catch this error at compile time!
				{ id: 'the_sub', type: 'some_other_type' as any, data: { workflowId: 200 } as any },
			],
			edges: [
				{ source: 'step_a', target: 'the_sub' },
			],
		}

		const builder = new GraphBuilder(subWorkflowNodeRegistry, {}, {
			subWorkflowNodeTypes: ['custom_sub_workflow'],
			subWorkflowResolver: mockSubWorkflowResolver,
		})

		expect(() => builder.build(graphWithUndeclaredSub)).toThrow(
			/Node with ID 'the_sub' has a 'workflowId' but its type 'some_other_type' is not in 'subWorkflowNodeTypes'./,
		)
	})
})

describe('graphBuilder with parallel start nodes', () => {
	const A = contextKey<string>('a')
	const B = contextKey<string>('b')
	const RESULT = contextKey<string>('result')

	interface ParallelTestMap extends NodeTypeMap {
		'set-value': { key: 'a' | 'b', value: string }
		'combine': Record<string, never>
	}

	interface ParallelTestContext {
		registry: TypedNodeRegistry<ParallelTestMap, ParallelTestContext>
	}

	class SetValueNode extends Node {
		private key: 'a' | 'b'
		private value: string
		constructor(options: NodeConstructorOptions<ParallelTestMap['set-value'], ParallelTestContext> & ParallelTestContext) {
			super(options)
			this.key = options.data.key
			this.value = options.data.value
		}

		async exec({ ctx }: NodeArgs) {
			const key = this.key === 'a' ? A : B
			ctx.set(key, this.value)
		}
	}

	class CombineNode extends Node {
		constructor(options: NodeConstructorOptions<ParallelTestMap['combine'], ParallelTestContext> & ParallelTestContext) {
			super(options)
		}

		async exec({ ctx }: NodeArgs) {
			const valA = ctx.get(A)
			const valB = ctx.get(B)
			ctx.set(RESULT, `${valA}-${valB}`)
		}
	}

	const parallelRegistry = createNodeRegistry<ParallelTestMap, ParallelTestContext>({
		'set-value': SetValueNode,
		'combine': CombineNode,
	})

	it('should build and run a graph with multiple start nodes in parallel', async () => {
		const graph: TypedWorkflowGraph<ParallelTestMap> = {
			nodes: [
				{ id: 'set-a', type: 'set-value', data: { key: 'a', value: 'Hello' } },
				{ id: 'set-b', type: 'set-value', data: { key: 'b', value: 'World' } },
				{ id: 'combiner', type: 'combine', data: {} },
			],
			edges: [
				{ source: 'set-a', target: 'combiner' },
				{ source: 'set-b', target: 'combiner' },
			],
		}

		const builder = new GraphBuilder(
			parallelRegistry,
			{ registry: parallelRegistry },
			{ subWorkflowNodeTypes: [] },
		)
		const { flow } = builder.build(graph)
		const ctx = new TypedContext()

		await flow.run(ctx)

		expect(ctx.get(RESULT)).toBe('Hello-World')
	})
})

describe('graphBuilder fan-in logic', () => {
	interface FanInNodeTypeMap extends NodeTypeMap {
		'start': Record<string, never>
		'branch-a': Record<string, never>
		'branch-b': Record<string, never>
		'mid-a': Record<string, never>
		'mid-b': Record<string, never>
		'converge': Record<string, never>
		'end': Record<string, never>
		'orphan-end': Record<string, never>
	}

	// Simple named nodes for clarity in test graphs
	class StartNode extends Node { }
	class BranchANode extends Node { }
	class BranchBNode extends Node { }
	class MidANode extends Node { }
	class MidBNode extends Node { }
	class ConvergeNode extends Node { }
	class EndNode extends Node { }
	class OrphanEndNode extends Node { }

	const fanInRegistry = createNodeRegistry<FanInNodeTypeMap>({
		'start': StartNode,
		'branch-a': BranchANode,
		'branch-b': BranchBNode,
		'mid-a': MidANode,
		'mid-b': MidBNode,
		'converge': ConvergeNode,
		'end': EndNode,
		'orphan-end': OrphanEndNode,
	})

	it('should correctly wire a deep convergence from a mid-flow fan-out', async () => {
		const graph: TypedWorkflowGraph<FanInNodeTypeMap> = {
			nodes: [
				{ id: 'start', type: 'start', data: {} },
				{ id: 'branch-a', type: 'branch-a', data: {} },
				{ id: 'branch-b', type: 'branch-b', data: {} },
				{ id: 'mid-a', type: 'mid-a', data: {} },
				{ id: 'mid-b', type: 'mid-b', data: {} },
				{ id: 'converge', type: 'converge', data: {} },
				{ id: 'end', type: 'end', data: {} },
			],
			edges: [
				// start fans out to a and b
				{ source: 'start', target: 'branch-a' },
				{ source: 'start', target: 'branch-b' },
				// each branch has an intermediate step
				{ source: 'branch-a', target: 'mid-a' },
				{ source: 'branch-b', target: 'mid-b' },
				// both intermediate steps fan-in to converge
				{ source: 'mid-a', target: 'converge' },
				{ source: 'mid-b', target: 'converge' },
				// converge proceeds to end
				{ source: 'converge', target: 'end' },
			],
		}

		const builder = new GraphBuilder(fanInRegistry)
		const { nodeMap } = builder.build(graph)

		const startNode = nodeMap.get('start')!
		const parallelContainer = startNode.successors.get(DEFAULT_ACTION)?.[0]
		const convergeNode = nodeMap.get('converge')

		// The ParallelFlow container should be the direct successor of the start node.
		expect(parallelContainer).toBeInstanceOf(ParallelFlow)
		// The container's successor should be the auto-detected convergence node.
		expect(parallelContainer!.successors.get(DEFAULT_ACTION)?.[0]).toBe(convergeNode)
	})

	it('should correctly wire a deep convergence from parallel start nodes', async () => {
		const graph: TypedWorkflowGraph<FanInNodeTypeMap> = {
			nodes: [
				// Two start nodes
				{ id: 'start-a', type: 'branch-a', data: {} },
				{ id: 'start-b', type: 'branch-b', data: {} },
				{ id: 'mid-a', type: 'mid-a', data: {} },
				{ id: 'mid-b', type: 'mid-b', data: {} },
				{ id: 'converge', type: 'converge', data: {} },
			],
			edges: [
				{ source: 'start-a', target: 'mid-a' },
				{ source: 'start-b', target: 'mid-b' },
				{ source: 'mid-a', target: 'converge' },
				{ source: 'mid-b', target: 'converge' },
			],
		}

		const builder = new GraphBuilder(fanInRegistry)
		const { flow, nodeMap } = builder.build(graph)

		const parallelStartContainer = flow.startNode
		const convergeNode = nodeMap.get('converge')

		// The flow's start node should be a ParallelFlow container
		expect(parallelStartContainer).toBeInstanceOf(ParallelFlow)
		// The container should be wired to the convergence node
		expect(parallelStartContainer!.successors.get(DEFAULT_ACTION)?.[0]).toBe(convergeNode)
	})

	it('should not wire a fan-in if the parallel branches never converge', async () => {
		const graph: TypedWorkflowGraph<FanInNodeTypeMap> = {
			nodes: [
				{ id: 'start', type: 'start', data: {} },
				{ id: 'branch-a', type: 'branch-a', data: {} },
				{ id: 'branch-b', type: 'branch-b', data: {} },
				{ id: 'end-a', type: 'end', data: {} },
				{ id: 'end-b', type: 'orphan-end', data: {} },
			],
			edges: [
				{ source: 'start', target: 'branch-a' },
				{ source: 'start', target: 'branch-b' },
				{ source: 'branch-a', target: 'end-a' },
				{ source: 'branch-b', target: 'end-b' },
			],
		}

		const builder = new GraphBuilder(fanInRegistry)
		const { nodeMap } = builder.build(graph)
		const startNode = nodeMap.get('start')!
		const parallelContainer = startNode.successors.get(DEFAULT_ACTION)?.[0]

		expect(parallelContainer).toBeInstanceOf(ParallelFlow)
		// Since the branches don't converge, the container should have NO successors.
		expect(parallelContainer!.successors.size).toBe(0)
	})
})

describe('graphBuilder predecessor maps', () => {
	interface TestNodeTypeMap {
		set: { value: number }
		add: { value: number }
	}

	class SetValueNode extends Node { }
	class AddValueNode extends Node { }

	const testRegistry = createNodeRegistry({
		set: SetValueNode,
		add: AddValueNode,
	})

	it('should correctly generate the predecessorIdMap', () => {
		const graph: TypedWorkflowGraph<TestNodeTypeMap> = {
			nodes: [
				{ id: 'start', type: 'set', data: { value: 10 } },
				{ id: 'task-a', type: 'add', data: { value: 1 } },
				{ id: 'task-b', type: 'add', data: { value: 2 } },
				{ id: 'join', type: 'add', data: { value: 3 } },
			],
			edges: [
				{ source: 'start', target: 'task-a' },
				{ source: 'start', target: 'task-b' },
				{ source: 'task-a', target: 'join' },
				{ source: 'task-b', target: 'join' },
			],
		}

		const builder = new GraphBuilder(testRegistry)
		const { predecessorIdMap } = builder.build(graph)

		// A start node should have no predecessors
		expect(predecessorIdMap.get('start')).toBeUndefined()

		// Nodes with one predecessor
		expect(predecessorIdMap.get('task-a')).toEqual(['start'])
		expect(predecessorIdMap.get('task-b')).toEqual(['start'])

		// The join node should have two predecessors
		const joinPredecessors = predecessorIdMap.get('join')
		expect(joinPredecessors).toBeDefined()
		expect(joinPredecessors).toHaveLength(2)
		expect(joinPredecessors).toEqual(expect.arrayContaining(['task-a', 'task-b']))
	})
})

describe('graphBuilder with conditional nodes', () => {
	const VALUE = contextKey<number>('value')
	const PATH = contextKey<string[]>('path')

	interface ConditionalNodeTypeMap {
		set: { value: number }
		branch: { threshold: number }
		logPath: { id: string }
	}

	class SetValueNode extends Node {
		private value: number
		constructor(options: NodeConstructorOptions<ConditionalNodeTypeMap['set']>) {
			super()
			this.value = options.data.value
		}

		async prep({ ctx }: NodeArgs) {
			ctx.set(VALUE, this.value)
		}
	}

	class ConditionalBranchNode extends Node<void, void, 'over' | 'under'> {
		private threshold: number
		constructor(options: NodeConstructorOptions<ConditionalNodeTypeMap['branch']>) {
			super()
			this.threshold = options.data.threshold
		}

		async post({ ctx }: NodeArgs) {
			const current = ctx.get(VALUE) ?? 0
			return current > this.threshold ? 'over' : 'under'
		}
	}

	class LogPathNode extends Node {
		private pathId: string
		constructor(options: NodeConstructorOptions<ConditionalNodeTypeMap['logPath']>) {
			super()
			this.pathId = options.data.id
		}

		async prep({ ctx }: NodeArgs) {
			const currentPath = ctx.get(PATH) ?? []
			ctx.set(PATH, [...currentPath, this.pathId])
		}
	}

	const conditionalRegistry = createNodeRegistry({
		set: SetValueNode,
		branch: ConditionalBranchNode,
		logPath: LogPathNode,
	})

	it('should wire conditional nodes directly without a parallel container', async () => {
		const graph: TypedWorkflowGraph<ConditionalNodeTypeMap> = {
			nodes: [
				{ id: 'start', type: 'set', data: { value: 10 } },
				{ id: 'brancher', type: 'branch', data: { threshold: 15 } },
				{ id: 'path-over', type: 'logPath', data: { id: 'over' } },
				{ id: 'path-under', type: 'logPath', data: { id: 'under' } },
			],
			edges: [
				{ source: 'start', target: 'brancher' },
				{ source: 'brancher', target: 'path-over', action: 'over' },
				{ source: 'brancher', target: 'path-under', action: 'under' },
			],
		}

		// --- Build WITH the conditionalNodeTypes option ---
		const builder = new GraphBuilder(conditionalRegistry, {}, {
			conditionalNodeTypes: ['branch'], // Tell the builder 'branch' is conditional
		})

		const { flow, nodeMap } = builder.build(graph)
		const ctx = new TypedContext()

		// --- Run the flow and assert the correct path was taken ---
		await flow.run(ctx, runOptions)
		expect(ctx.get(PATH)).toEqual(['under'])

		// --- Assert the graph structure is correct ---
		const brancherNode = nodeMap.get('brancher')!
		const pathOverNode = nodeMap.get('path-over')!
		const pathUnderNode = nodeMap.get('path-under')!

		// The successors should be the actual nodes, NOT a ParallelFlow container
		expect(brancherNode.successors.get('over')?.[0]).toBe(pathOverNode)
		expect(brancherNode.successors.get('under')?.[0]).toBe(pathUnderNode)
		expect(brancherNode.successors.get(DEFAULT_ACTION)).toBeUndefined()
		expect(brancherNode).not.toBeInstanceOf(ParallelFlow)

		// Verify no parallel container was created for 'brancher'
		expect(nodeMap.has('brancher__parallel_container')).toBe(false)

		// Verify no parallel container was created for 'brancher'
		expect(nodeMap.has('brancher__parallel_container')).toBe(false)
	})

	it('should create a parallel container when a non-conditional node has multiple successors', async () => {
		const graph: TypedWorkflowGraph<ConditionalNodeTypeMap> = {
			nodes: [
				{ id: 'start', type: 'set', data: { value: 20 } }, // This will go 'over'
				{ id: 'brancher', type: 'branch', data: { threshold: 15 } },
				{ id: 'path-over', type: 'logPath', data: { id: 'over' } },
				{ id: 'parallel-a', type: 'logPath', data: { id: 'A' } },
				{ id: 'parallel-b', type: 'logPath', data: { id: 'B' } },
			],
			edges: [
				{ source: 'start', target: 'brancher' },
				{ source: 'brancher', target: 'path-over', action: 'over' },
				// Fan out from 'path-over'
				{ source: 'path-over', target: 'parallel-a' },
				{ source: 'path-over', target: 'parallel-b' },
			],
		}

		// --- Build WITHOUT the conditionalNodeTypes option for 'logPath' ---
		const builder = new GraphBuilder(conditionalRegistry, {}, {
			conditionalNodeTypes: ['branch'],
		})

		const { flow, nodeMap } = builder.build(graph)
		const ctx = new TypedContext()
		await flow.run(ctx, runOptions)

		// Assert the final path contains all expected logs
		expect(ctx.get(PATH)).toEqual(expect.arrayContaining(['over', 'A', 'B']))

		// --- Assert the graph structure ---
		const pathOverNode = nodeMap.get('path-over')!
		const parallelContainer = nodeMap.get('path-over__parallel_container')!

		// The successor of path-over SHOULD be a parallel container
		expect(pathOverNode.successors.get(DEFAULT_ACTION)?.[0]).toBe(parallelContainer)
		expect(parallelContainer).toBeInstanceOf(ParallelFlow)
	})
})

describe('graphBuilder with conditional path convergence', () => {
	const VALUE = contextKey<number>('value')

	interface ConditionalNodeTypeMap {
		'set': { value: number }
		'branch': { threshold: number }
		'path-action': Record<string, never>
		'converge': Record<string, never>
	}

	class SetValueNode extends Node {
		private value: number
		constructor(options: NodeConstructorOptions<ConditionalNodeTypeMap['set']>) {
			super()
			this.value = options.data.value
		}

		async prep({ ctx }: NodeArgs) {
			ctx.set(VALUE, this.value)
		}
	}

	class ConditionalBranchNode extends Node<void, void, 'over' | 'under'> {
		private threshold: number
		constructor(options: NodeConstructorOptions<ConditionalNodeTypeMap['branch']>) {
			super()
			this.threshold = options.data.threshold
		}

		async post({ ctx }: NodeArgs) {
			const current = ctx.get(VALUE) ?? 0
			return current > this.threshold ? 'over' : 'under'
		}
	}

	class PathActionNode extends Node { }
	class ConvergeNode extends Node { }

	const conditionalRegistry = createNodeRegistry({
		'set': SetValueNode,
		'branch': ConditionalBranchNode,
		'path-action': PathActionNode,
		'converge': ConvergeNode,
	})

	const converganceGraph: TypedWorkflowGraph<ConditionalNodeTypeMap> = {
		nodes: [
			{ id: 'start', type: 'set', data: { value: 10 } },
			{ id: 'brancher', type: 'branch', data: { threshold: 15 } },
			{ id: 'over-action', type: 'path-action', data: {} },
			{ id: 'under-action', type: 'path-action', data: {} },
			{ id: 'converge-point', type: 'converge', data: {} },
		],
		edges: [
			{ source: 'start', target: 'brancher' },
			// Conditional split
			{ source: 'brancher', target: 'over-action', action: 'over' },
			{ source: 'brancher', target: 'under-action', action: 'under' },
			// Paths reconverge
			{ source: 'over-action', target: 'converge-point' },
			{ source: 'under-action', target: 'converge-point' },
		],
	}

	it('should NOT create a fan-in for a node where conditional paths reconverge', () => {
		const builder = new GraphBuilder(conditionalRegistry, {}, {
			conditionalNodeTypes: ['branch'],
		})

		const { predecessorCountMap, predecessorIdMap, nodeMap } = builder.build(converganceGraph)

		const joinNodeId = 'brancher__conditional_join'
		const convergencePredecessors = predecessorIdMap.get('converge-point')

		expect(nodeMap.has(joinNodeId)).toBe(true)
		expect(convergencePredecessors).toEqual([joinNodeId])

		const joinNodePredecessors = predecessorIdMap.get(joinNodeId)
		expect(joinNodePredecessors).toEqual(expect.arrayContaining(['over-action', 'under-action']))
		expect(predecessorCountMap.get('converge-point')).toBe(1)
	})

	it('should correctly rewire the graph so the final convergence point has only one predecessor', () => {
		const builder = new GraphBuilder(conditionalRegistry, {}, {
			conditionalNodeTypes: ['branch'],
		})

		const { predecessorCountMap } = builder.build(converganceGraph)
		expect(predecessorCountMap.get('converge-point')).toBe(1)
	})

	it('should assign a predecessor count of 1 to the internal join node to prevent fan-in stalls', () => {
		const builder = new GraphBuilder(conditionalRegistry, {}, {
			conditionalNodeTypes: ['branch'],
		})

		const { predecessorCountMap } = builder.build(converganceGraph)
		const internalJoinNodeId = 'brancher__conditional_join'
		expect(predecessorCountMap.get(internalJoinNodeId)).toBe(1)
	})

	it('should correctly handle convergence from deeper, asymmetrical conditional paths', () => {
		const graph: TypedWorkflowGraph<ConditionalNodeTypeMap> = {
			nodes: [
				{ id: 'start', type: 'set', data: { value: 10 } },
				{ id: 'brancher', type: 'branch', data: { threshold: 5 } }, // Will take 'over' path
				{ id: 'over-action-1', type: 'path-action', data: {} },
				{ id: 'over-action-2', type: 'path-action', data: {} }, // Deeper path
				{ id: 'under-action-1', type: 'path-action', data: {} }, // Shallower path
				{ id: 'converge-point', type: 'converge', data: {} },
			],
			edges: [
				{ source: 'start', target: 'brancher' },
				// Conditional split
				{ source: 'brancher', target: 'over-action-1', action: 'over' },
				{ source: 'brancher', target: 'under-action-1', action: 'under' },
				// 'over' path is one step longer
				{ source: 'over-action-1', target: 'over-action-2' },
				// Paths reconverge from different depths
				{ source: 'over-action-2', target: 'converge-point' },
				{ source: 'under-action-1', target: 'converge-point' },
			],
		}

		const builder = new GraphBuilder(conditionalRegistry, {}, {
			conditionalNodeTypes: ['branch'],
		})

		const { predecessorCountMap, predecessorIdMap, nodeMap } = builder.build(graph)

		const joinNodeId = 'brancher__conditional_join'

		expect(nodeMap.has(joinNodeId)).toBe(true)
		expect(predecessorIdMap.get('converge-point')).toEqual([joinNodeId])
		expect(predecessorIdMap.get(joinNodeId)).toEqual(expect.arrayContaining([
			'over-action-2', // The end of the deep path
			'under-action-1', // The end of the shallow path
		]))

		expect(predecessorCountMap.get('converge-point')).toBe(1)
	})
})

describe('graphBuilder with custom internal nodes', () => {
	const PARENT_VALUE = contextKey<string>('parent_value')
	const SUB_VALUE = contextKey<string>('sub_value')
	const FINAL_VALUE = contextKey<string>('final_value')
	const CUSTOM_MAPPER_FLAG = contextKey<boolean>('custom_mapper_ran')

	// A custom implementation of one of the builder's internal nodes.
	// It has a unique, testable side-effect.
	class CustomInputMapper extends Node {
		private mappings: Record<string, string>
		constructor(options: { data: Record<string, string> }) {
			super()
			const { nodeId, ...mappings } = options.data
			this.mappings = mappings
		}

		async prep({ ctx }: NodeArgs) {
			// Perform the standard input mapping logic
			for (const [subKey, parentKey] of Object.entries(this.mappings)) {
				if (ctx.has(parentKey))
					ctx.set(subKey, ctx.get(parentKey))
			}
			// Add the custom, testable side-effect
			ctx.set(CUSTOM_MAPPER_FLAG, true)
		}
	}

	// --- Re-using setup from the sub-workflow tests for consistency ---
	class AppendStringNode extends Node {
		private str: string
		constructor(options: { data: { value: string } }) {
			super()
			this.str = options.data.value
		}

		async exec({ prepRes }: NodeArgs<string>): Promise<string> {
			return `${prepRes} -> ${this.str}`
		}

		async prep({ ctx }: NodeArgs): Promise<string> {
			return ctx.get(SUB_VALUE) ?? ctx.get(PARENT_VALUE) ?? 'start'
		}

		async post({ ctx, execRes }: NodeArgs<string, string>) {
			const key = ctx.has(SUB_VALUE) ? SUB_VALUE : PARENT_VALUE
			ctx.set(key, execRes)
		}
	}

	class FinalOutputNode extends Node {
		async prep({ ctx }: NodeArgs) {
			const subResult = ctx.get(PARENT_VALUE) ?? ''
			ctx.set(FINAL_VALUE, `final: ${subResult}`)
		}
	}

	const mockSubWorkflowResolver: SubWorkflowResolver & { graphs: Map<number, WorkflowGraph> } = {
		graphs: new Map<number, WorkflowGraph>([
			[300, {
				nodes: [
					{ id: 'step_d', type: 'append', data: { value: 'D' } },
				],
				edges: [],
			}],
		]),
		getGraph(id: number | string) {
			return typeof id === 'number' ? this.graphs.get(id) : undefined
		},
	}
	// --- End of re-used setup ---

	it('should use a user-provided implementation for an internal node type', async () => {
		// Create a registry where we override an internal node type
		const customInternalRegistry: NodeRegistry = new Map<string, new (...args: any[]) => AbstractNode>([
			['append', AppendStringNode],
			['final', FinalOutputNode],
			['custom_sub_workflow', Node], // Just a placeholder type
			// --- THIS IS THE KEY PART OF THE TEST ---
			// Provide our own class for an internal node name.
			['__internal_input_mapper__', CustomInputMapper],
		])

		const parentGraph: WorkflowGraph = {
			nodes: [
				{ id: 'step_a', type: 'append', data: { value: 'A' } },
				{
					id: 'the_sub',
					type: 'custom_sub_workflow',
					data: {
						workflowId: 300,
						inputs: { sub_value: 'parent_value' },
						outputs: { parent_value: 'sub_value' },
					},
				},
				{ id: 'step_c', type: 'final', data: {} },
			],
			edges: [
				{ source: 'step_a', target: 'the_sub' },
				{ source: 'the_sub', target: 'step_c' },
			],
		}

		// Instantiate the builder with our custom registry
		const builder = new GraphBuilder(customInternalRegistry, {}, {
			subWorkflowNodeTypes: ['custom_sub_workflow'],
			subWorkflowResolver: mockSubWorkflowResolver,
		})

		const { flow, nodeMap } = builder.build(parentGraph)
		const ctx = new TypedContext()

		// Run the flow
		await flow.run(ctx, runOptions)

		// 1. Verify that the flow ran correctly, meaning our custom node didn't break anything.
		expect(ctx.get(FINAL_VALUE)).toBe('final: start -> A -> D')

		// 2. Verify that our custom node's side-effect occurred.
		// This proves the builder used our implementation.
		expect(ctx.get(CUSTOM_MAPPER_FLAG)).toBe(true)

		// 3. (Optional) Verify that an instance of our custom class exists in the final node map.
		const inputMapperInstance = Array.from(nodeMap.values()).find(
			node => node instanceof CustomInputMapper,
		)
		expect(inputMapperInstance).toBeDefined()
		expect(inputMapperInstance).toBeInstanceOf(CustomInputMapper)
	})
})

describe('graphBuilder with complex fan-in', () => {
	interface BuggyNodeTypeMap extends NodeTypeMap {
		process: Record<string, never>
		output: Record<string, never>
		workflow: { workflowId: number }
	}

	class MyTestNode extends Node { }

	const buggyRegistry = createNodeRegistry<BuggyNodeTypeMap>({
		process: MyTestNode,
		output: MyTestNode,
		workflow: Node as any,
	})

	it('should correctly calculate predecessors and wire a graph where a parallel start node is also a fan-in point', () => {
		const childGraph: TypedWorkflowGraph<BuggyNodeTypeMap> = {
			nodes: [
				{ id: 'pa835', type: 'process', data: {} },
				{ id: 'pe5cf', type: 'process', data: {} },
				{ id: 'o62f7', type: 'output', data: {} },
				{ id: 'p25d6', type: 'process', data: {} },
			],
			edges: [
				{ source: 'pa835', target: 'o62f7' },
				{ source: 'pe5cf', target: 'p25d6' },
				{ source: 'p25d6', target: 'o62f7' },
			],
		}

		const parentGraph: TypedWorkflowGraph<BuggyNodeTypeMap> = {
			nodes: [
				{ id: 'w808d', type: 'workflow', data: { workflowId: 808 } },
				{ id: 'p9a2c', type: 'process', data: {} },
			],
			edges: [
				{ source: 'w808d', target: 'p9a2c' },
			],
		}

		const mockSubWorkflowResolver: SubWorkflowResolver = {
			getGraph(id: number | string) {
				if (id === 808)
					return childGraph
				return undefined
			},
		}

		const mockLogger = {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		}

		const builder = new GraphBuilder(buggyRegistry, {}, {
			subWorkflowNodeTypes: ['workflow'],
			subWorkflowResolver: mockSubWorkflowResolver,
		}, mockLogger)

		const { predecessorCountMap, nodeMap } = builder.build(parentGraph)
		const fanInNodeId = 'w808d:o62f7'
		const fanInNode = nodeMap.get(fanInNodeId)!
		const inputMapper = nodeMap.get('w808d_input_mapper')!
		const parallelContainer = inputMapper.successors.get(DEFAULT_ACTION)?.[0]
		expect(parallelContainer!.successors.size).toBe(1)
		expect(parallelContainer!.successors.get(DEFAULT_ACTION)?.[0]).toBe(fanInNode)
		expect(predecessorCountMap.get(fanInNodeId)).toBe(2)
	})
})

describe('graphBuilder with sub-workflows and context passing', () => {
	interface SubWorkflowContextMap extends NodeTypeMap {
		'start-task': Record<string, never>
		'end-task': Record<string, never>
		'sub-workflow-node': { workflowId: number, inputs: Record<string, string>, outputs: Record<string, string> }
		'process': Record<string, never>
	}

	class TestNode extends Node { }

	const subWorkflowRegistry = createNodeRegistry<SubWorkflowContextMap>({
		'start-task': TestNode,
		'end-task': TestNode,
		'sub-workflow-node': TestNode,
		'process': TestNode,
	})

	it('should correctly generate originalPredecessorIdMap for sub-workflows', () => {
		const childGraph: TypedWorkflowGraph<SubWorkflowContextMap> = {
			nodes: [
				{ id: 'child-process', type: 'process', data: {} },
			],
			edges: [],
		}

		const parentGraph: TypedWorkflowGraph<SubWorkflowContextMap> = {
			nodes: [
				{ id: 'start', type: 'start-task', data: {} },
				{
					id: 'my-sub',
					type: 'sub-workflow-node',
					data: {
						workflowId: 101,
						inputs: {},
						outputs: {},
					},
				},
				{ id: 'end', type: 'end-task', data: {} },
			],
			edges: [
				{ source: 'start', target: 'my-sub' },
				{ source: 'my-sub', target: 'end' },
			],
		}

		const mockSubWorkflowResolver: SubWorkflowResolver = {
			getGraph(id) {
				if (id === 101)
					return childGraph
				return undefined
			},
		}

		const builder = new GraphBuilder(subWorkflowRegistry, {}, {
			subWorkflowNodeTypes: ['sub-workflow-node'],
			subWorkflowResolver: mockSubWorkflowResolver,
		})

		const { originalPredecessorIdMap, nodeMap } = builder.build(parentGraph)

		const endNodePredecessors = originalPredecessorIdMap.get('end')
		expect(endNodePredecessors).toBeDefined()
		expect(endNodePredecessors).toEqual(['my-sub'])

		const outputMapperId = Array.from(nodeMap.keys()).find(k => k.includes('output_mapper'))!
		const outputMapper = nodeMap.get(outputMapperId)!
		const endNode = nodeMap.get('end')!
		expect(outputMapper.successors.get(DEFAULT_ACTION)?.[0]).toBe(endNode)
		expect(originalPredecessorIdMap.has(outputMapperId)).toBe(false)
	})
})

import type { AbstractNode, Logger, NodeArgs, RunOptions } from '../workflow'
import type { NodeConstructorOptions, NodeRegistry, TypedWorkflowGraph, WorkflowGraph } from './graph.types'
import { describe, expect, it, vi } from 'vitest'
import { ConsoleLogger, contextKey, Node, TypedContext } from '../workflow'
import { createNodeRegistry, GraphBuilder } from './graph'

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

	const testRegistry = createNodeRegistry({
		set: SetValueNode,
		add: AddValueNode,
		branch: ConditionalBranchNode,
		logPath: LogPathNode,
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
			ctx.set(SUB_VALUE, execRes)
		}
	}

	class FinalOutputNode extends Node {
		constructor(_options: NodeConstructorOptions<TestSubWorkflowNodeTypeMap['final']>) {
			super()
		}

		async prep({ ctx }: NodeArgs) {
			const subResult = ctx.get(SUB_VALUE) ?? ''
			ctx.set(FINAL_VALUE, `final: ${subResult}`)
		}
	}

	const mockRegistry = {
		registry: createNodeRegistry({
			append: AppendStringNode,
			final: FinalOutputNode,
		}),
		graphs: new Map<number, WorkflowGraph>([
			[200, {
				nodes: [
					{ id: 'step_d', type: 'append', data: { value: 'D' } },
					{ id: 'step_e', type: 'append', data: { value: 'E' } },
				],
				edges: [{ source: 'step_d', target: 'step_e' }],
			}],
		]),
		getGraph(id: number) {
			return this.graphs.get(id)
		},
	}

	it('should correctly inline a sub-workflow and run the flattened graph', async () => {
		const parentGraph: TypedWorkflowGraph<TestSubWorkflowNodeTypeMap> = {
			nodes: [
				{ id: 'step_a', type: 'append', data: { value: 'A' } },
				{
					id: 'the_sub',
					type: 'custom_sub_workflow',
					data: {
						workflowId: 200,
						inputs: { sub_value: 'parent_value' }, // PARENT_VALUE
						outputs: { parent_value: 'sub_value' }, // SUB_VALUE
					},
				},
				{ id: 'step_c', type: 'final', data: {} },
			],
			edges: [
				{ source: 'step_a', target: 'the_sub' },
				{ source: 'the_sub', target: 'step_c' },
			],
		}

		const builder = new GraphBuilder(mockRegistry.registry, { registry: mockRegistry }, {
			subWorkflowNodeTypes: ['custom_sub_workflow'],
		})

		const { flow } = builder.build(parentGraph)
		const ctx = new TypedContext([
			[PARENT_VALUE, 'start'],
		])

		await flow.run(ctx, runOptions)
		expect(ctx.get(FINAL_VALUE)).toBe('final: start -> A -> D -> E')
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

		const builder = new GraphBuilder(mockRegistry.registry, { registry: mockRegistry }, {
			subWorkflowNodeTypes: ['custom_sub_workflow'],
		})

		expect(() => builder.build(graphWithUndeclaredSub)).toThrow(
			/Node with ID 'the_sub' and type 'some_other_type' contains a 'workflowId' property, but its type is not registered/,
		)
	})
})

describe('graphBuilder with parallel start nodes', () => {
	const A = contextKey<string>('a')
	const B = contextKey<string>('b')
	const RESULT = contextKey<string>('result')

	interface ParallelTestMap {
		'set-value': { key: 'a' | 'b', value: string }
		'combine': Record<string, never>
	}

	class SetValueNode extends Node {
		private key: 'a' | 'b'
		private value: string
		constructor(options: NodeConstructorOptions<ParallelTestMap['set-value']>) {
			super(options) // Pass options up for potential retries etc.
			this.key = options.data.key
			this.value = options.data.value
		}

		async exec({ ctx }: NodeArgs) {
			const key = this.key === 'a' ? A : B
			ctx.set(key, this.value)
		}
	}

	class CombineNode extends Node {
		constructor(options: NodeConstructorOptions<ParallelTestMap['combine']>) {
			super(options)
		}

		async exec({ ctx }: NodeArgs) {
			const valA = ctx.get(A)
			const valB = ctx.get(B)
			ctx.set(RESULT, `${valA}-${valB}`)
		}
	}

	const parallelRegistry = createNodeRegistry<ParallelTestMap>({
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
			new ConsoleLogger(),
		)
		const { flow } = builder.build(graph)
		const ctx = new TypedContext()

		await flow.run(ctx, runOptions)

		expect(ctx.get(RESULT)).toBe('Hello-World')
	})
})

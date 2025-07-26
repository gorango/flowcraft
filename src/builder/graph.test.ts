import type { AbstractNode, Logger, NodeArgs, RunOptions } from '../workflow'
import type { NodeConstructorOptions, NodeRegistry, TypedWorkflowGraph, WorkflowGraph } from './graph'
import { describe, expect, it, vi } from 'vitest'
import { contextKey, Node, TypedContext } from '../workflow'
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

	interface TestNodeTypeMap {
		set: { value: number }
		add: { value: number }
		branch: { threshold: number }
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

	const testRegistry = createNodeRegistry({
		set: SetValueNode,
		add: AddValueNode,
		branch: ConditionalBranchNode,
	})

	it('should build and run a complex graph with parallel fan-out', async () => {
		const graph: TypedWorkflowGraph<TestNodeTypeMap> = {
			nodes: [
				{ id: 'start', type: 'set', data: { value: 10 } },
				{ id: 'brancher', type: 'branch', data: { threshold: 15 } },
				{ id: 'add-10', type: 'add', data: { value: 10 } }, // Path A
				{ id: 'add-100', type: 'add', data: { value: 100 } }, // Path B
				{ id: 'add-1', type: 'add', data: { value: 1 } }, // Path C, runs in parallel with D
				{ id: 'add-2', type: 'add', data: { value: 2 } }, // Path D, runs in parallel with C
				{ id: 'final', type: 'add', data: { value: 1000 } },
				// TRY THIS: Uncomment the lines below. TypeScript will throw an error!
				// { id: 'error-test', type: 'add', data: { threshold: 99 } },
				// { id: 'error-test', type: 'add', data: { WRONG_PROP: 99 } },
			],
			edges: [
				{ source: 'start', target: 'brancher' },
				{ source: 'brancher', target: 'add-10', action: 'under' },
				{ source: 'brancher', target: 'add-100', action: 'over' },
				// Fan-out from 'add-10'
				{ source: 'add-10', target: 'add-1' },
				{ source: 'add-10', target: 'add-2' },
				// Fan-in to 'final'
				{ source: 'add-1', target: 'final' },
				{ source: 'add-2', target: 'final' },
				{ source: 'add-100', target: 'final' },
			],
		}

		const builder = new GraphBuilder(testRegistry)
		const { flow } = builder.build(graph)
		const ctx = new TypedContext()
		await flow.run(ctx, runOptions)
		// Calculation:
		// 1. start: sets value to 10
		// 2. brancher: 10 is not > 15, so action is 'under'
		// 3. add-10: value becomes 10 + 10 = 20
		// 4. Parallel fan-out: add-1 and add-2 run.
		//    One will read 20 and write 21. The other will then read 21 and write 23.
		// 5. final: value becomes 23 + 1000 = 1023
		expect(ctx.get(VALUE)).toBe(1023)
	})
})

describe('graphBuilder (no type safety)', () => {
	const VALUE = contextKey<number>('value')

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

	const testRegistry: NodeRegistry = new Map<string, new (...args: any[]) => AbstractNode>([
		['set', SetValueNode],
		['add', AddValueNode],
		['branch', ConditionalBranchNode],
	])

	it('should build and run a simple graph using the untyped API', async () => {
		const graph: WorkflowGraph = {
			nodes: [
				{ id: 'start', type: 'set', data: { value: 10 } },
				{ id: 'brancher', type: 'branch', data: { threshold: 15 } },
				{ id: 'add-10', type: 'add', data: { value: 10 } },
				{ id: 'add-100', type: 'add', data: { value: 100 } },
				{ id: 'add-1', type: 'add', data: { value: 1 } },
				{ id: 'add-2', type: 'add', data: { value: 2 } },
				{ id: 'final', type: 'add', data: { value: 1000 } },
			],
			edges: [
				{ source: 'start', target: 'brancher' },
				{ source: 'brancher', target: 'add-10', action: 'under' },
				{ source: 'brancher', target: 'add-100', action: 'over' },
				{ source: 'add-10', target: 'add-1' },
				{ source: 'add-10', target: 'add-2' },
				{ source: 'add-1', target: 'final' },
				{ source: 'add-2', target: 'final' },
				{ source: 'add-100', target: 'final' },
			],
		}
		const builder = new GraphBuilder(testRegistry)
		const { flow } = builder.build(graph)
		const ctx = new TypedContext()
		await flow.run(ctx)
		expect(ctx.get(VALUE)).toBe(1023)
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

		// Expected execution path:
		// 1. step_a: runs on PARENT_VALUE='start', sets SUB_VALUE='start -> A'
		// 2. input_mapper: No-op, PARENT_VALUE is already in context for sub-nodes.
		// 3. step_d (inlined): reads SUB_VALUE='start -> A', sets SUB_VALUE='start -> A -> D'
		// 4. step_e (inlined): reads SUB_VALUE='start -> A -> D', sets SUB_VALUE='start -> A -> D -> E'
		// 5. output_mapper: copies SUB_VALUE='...E' to PARENT_VALUE.
		// 6. step_c: reads SUB_VALUE='...E', sets FINAL_VALUE.
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

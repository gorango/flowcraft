import type { NodeArgs } from '../../types'
import type { NodeConstructorOptions, SubWorkflowResolver, TypedWorkflowGraph, WorkflowGraph } from './types'
import { describe, expect, it } from 'vitest'
import { contextKey, TypedContext } from '../../context'
import { globalRunOptions } from '../../test-utils'
import { DebugLogger } from '../../test-utils/debug-logger'
import { Node } from '../../workflow/index'
import { createNodeRegistry, GraphBuilder } from './graph'
import { BlueprintExecutor } from './runner'

const debugLogger = new DebugLogger()

describe('graphBuilder', () => {
	const VALUE = contextKey<number>('value')
	const PATH_A_TAKEN = contextKey<boolean>('path_A')
	const PATH_B_TAKEN = contextKey<boolean>('path_B')

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
			await ctx.set(VALUE, this.value)
		}
	}

	class AddValueNode extends Node {
		private valueToAdd: number
		constructor(options: NodeConstructorOptions<TestNodeTypeMap['add']>) {
			super()
			this.valueToAdd = options.data.value
		}

		async prep({ ctx }: NodeArgs) {
			const current = (await ctx.get(VALUE)) ?? 0
			await ctx.set(VALUE, current + this.valueToAdd)
		}
	}

	class ConditionalBranchNode extends Node<void, void, string> {
		private threshold: number
		constructor(options: NodeConstructorOptions<TestNodeTypeMap['branch']>) {
			super()
			this.threshold = options.data.threshold
		}

		async post({ ctx }: NodeArgs) {
			const current = (await ctx.get(VALUE)) ?? 0
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
			if (this.pathId === 'path_A') {
				await ctx.set(PATH_A_TAKEN, true)
			}
			else if (this.pathId === 'path_B') {
				await ctx.set(PATH_B_TAKEN, true)
			}
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

	it('should build a serializable blueprint and run it via the BlueprintExecutor', async () => {
		const graph: TypedWorkflowGraph<TestNodeTypeMap> = {
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
		const { blueprint } = builder.buildBlueprint(graph)

		// Assert that the blueprint is serializable (no Maps, Symbols, etc.)
		expect(blueprint.predecessorCountMap).toBeInstanceOf(Object)
		expect(blueprint.predecessorCountMap).not.toBeInstanceOf(Map)
		expect(blueprint.originalPredecessorIdMap).toBeInstanceOf(Object)

		// Now, hydrate and run
		const executor = new BlueprintExecutor(blueprint, testRegistry)
		const ctx = new TypedContext()
		await executor.run(executor.flow, ctx, globalRunOptions)

		// Assert correct execution
		expect(await ctx.get(VALUE)).toBe(1020)

		const pathATaken = await ctx.get(PATH_A_TAKEN)
		const pathBTaken = await ctx.get(PATH_B_TAKEN)
		expect(pathATaken).toBe(true)
		expect(pathBTaken).toBe(true)
	})

	it('should correctly generate predecessor maps in the blueprint', () => {
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
		const { blueprint } = builder.buildBlueprint(graph)
		const { originalPredecessorIdMap, predecessorCountMap } = blueprint

		expect(originalPredecessorIdMap.start).toBeUndefined()
		expect(originalPredecessorIdMap['task-a']).toEqual(['start'])
		expect(originalPredecessorIdMap['task-b']).toEqual(['start'])
		const joinPredecessors = originalPredecessorIdMap.join
		expect(joinPredecessors).toBeDefined()
		expect(joinPredecessors).toHaveLength(2)
		expect(joinPredecessors).toEqual(expect.arrayContaining(['task-a', 'task-b']))

		expect(predecessorCountMap.start).toBe(0)
		expect(predecessorCountMap['task-a']).toBe(1)
		expect(predecessorCountMap['task-b']).toBe(1)
		expect(predecessorCountMap.join).toBe(2)
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

		const builder = new GraphBuilder(testRegistry, {}, {}, debugLogger)
		const { blueprint } = builder.buildBlueprint(graphWithConfig)

		const configuredBlueprintNode = blueprint.nodes.find(n => n.id === 'node-with-config')
		expect(configuredBlueprintNode?.config).toEqual({ maxRetries: 5, wait: 100 })
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
			return (await ctx.get(SUB_VALUE)) ?? (await ctx.get(PARENT_VALUE)) ?? 'start'
		}

		async post({ ctx, execRes }: NodeArgs<string, string>) {
			const key = (await ctx.has(SUB_VALUE)) ? SUB_VALUE : PARENT_VALUE
			ctx.set(key, execRes)
		}
	}

	class FinalOutputNode extends Node {
		constructor(_options: NodeConstructorOptions<TestSubWorkflowNodeTypeMap['final']>) {
			super()
		}

		async prep({ ctx }: NodeArgs) {
			const subResult = (await ctx.get(PARENT_VALUE)) ?? ''
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

	it('should correctly inline a sub-workflow in the blueprint and run it', async () => {
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

		const { blueprint } = builder.buildBlueprint(parentGraph)

		// Verify that the blueprint was flattened as expected.
		expect(blueprint.nodes.find(n => n.id === 'the_sub')).toBeDefined()
		expect(blueprint.nodes.find(n => n.id === 'the_sub:step_d')).toBeDefined()
		expect(blueprint.nodes.find(n => n.id.includes('input_mapper'))).toBeDefined()
		expect(blueprint.nodes.find(n => n.id.includes('output_mapper'))).toBeDefined()

		// Run the blueprint
		const executor = new BlueprintExecutor(blueprint, subWorkflowNodeRegistry)
		const ctx = new TypedContext([
			[PARENT_VALUE, 'start'],
		])
		await executor.run(executor.flow, ctx, globalRunOptions)

		// The end-to-end result should be the same, proving the wiring is correct.
		expect(await ctx.get(FINAL_VALUE)).toBe('final: start -> A -> D -> E')
	})
})

describe('graphBuilder sub-workflow predecessor mapping', () => {
	const PARENT_OUTPUT = contextKey<string>('parent_output')
	const SUB_OUTPUT = contextKey<string>('sub_output')

	class ParentProducerNode extends Node<void, string> {
		async exec() { return 'data_from_parent' }
		async post({ ctx, execRes }: NodeArgs<void, string>) {
			await ctx.set(PARENT_OUTPUT, execRes)
		}
	}

	class SubTaskNode extends Node<string, string> {
		async prep({ ctx }: NodeArgs) { return await ctx.get(PARENT_OUTPUT) ?? 'no_parent_data' }
		async exec({ prepRes }: NodeArgs<string>) { return `${prepRes}_plus_sub_data` }
		async post({ ctx, execRes }: NodeArgs<string, string>) {
			await ctx.set(SUB_OUTPUT, execRes)
		}
	}

	class FinalConsumerNode extends Node { }

	const testRegistry = createNodeRegistry({
		parent_producer: ParentProducerNode,
		sub_task: SubTaskNode,
		final_consumer: FinalConsumerNode,
	})

	const subWorkflowGraph: WorkflowGraph = {
		nodes: [{ id: 'task1', type: 'sub_task', data: {} }],
		edges: [],
	}

	const parentGraph: TypedWorkflowGraph<any> = {
		nodes: [
			{ id: 'parent', type: 'parent_producer', data: {} },
			{ id: 'sub', type: 'workflow', data: { workflowId: 101 } },
			{ id: 'final', type: 'final_consumer', data: {} },
		],
		edges: [
			{ source: 'parent', target: 'sub' },
			{ source: 'sub', target: 'final' },
		],
	}

	it('should correctly map original predecessors across sub-workflow boundaries', () => {
		const mockResolver: SubWorkflowResolver = {
			getGraph: id => (id === 101 ? subWorkflowGraph : undefined),
		}
		const builder = new GraphBuilder(testRegistry, {}, {
			subWorkflowNodeTypes: ['workflow'],
			subWorkflowResolver: mockResolver,
		})

		const { blueprint } = builder.buildBlueprint(parentGraph)
		const { originalPredecessorIdMap } = blueprint

		// Assertion 1: A node INSIDE the sub-workflow sees the PARENT producer.
		expect(originalPredecessorIdMap['sub:task1']).toBeDefined()
		expect(originalPredecessorIdMap['sub:task1']).toEqual(['parent'])

		// Assertion 2: A node AFTER the sub-workflow sees the SUB-WORKFLOW CONTAINER as its producer.
		expect(originalPredecessorIdMap.final).toBeDefined()
		expect(originalPredecessorIdMap.final).toEqual(['sub'])
	})
})

import type { NodeArgs } from '../../types'
import type { NodeConstructorOptions, SubWorkflowResolver, TypedWorkflowGraph, WorkflowGraph } from './types'
import { describe, expect, it } from 'vitest'
import { contextKey, TypedContext } from '../../context'
import { globalRunOptions } from '../../test-utils'
import { DebugLogger } from '../../test-utils/debug-logger'
import { Node } from '../../workflow'
import { createNodeRegistry, GraphBuilder } from './graph'
import { BlueprintExecutor } from './runner'

const debugLogger = new DebugLogger()

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
		expect(ctx.get(VALUE)).toBe(1020)
		const path = ctx.get(PATH)
		expect(path).toBeDefined()
		expect(path).toHaveLength(2)
		expect(path).toEqual(expect.arrayContaining(['path_A', 'path_B']))
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
			contextKeyMap: new Map([
				['parent_value', PARENT_VALUE],
				['sub_value', SUB_VALUE],
			]),
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
		expect(ctx.get(FINAL_VALUE)).toBe('final: start -> A -> D -> E')
	})
})

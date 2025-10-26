import { describe, expect, it } from 'vitest'
import { UnsafeEvaluator } from '../../src/evaluator'
import { createFlow } from '../../src/flow'
import { SubflowNode } from '../../src/nodes/subflow'
import { FlowRuntime } from '../../src/runtime'

describe('Built-In Nodes', () => {
	describe('Batch Operations', () => {
		it('should correctly execute batch-scatter and batch-gather with multiple items', async () => {
			let workerExecutionCount = 0
			const workerFunction = async (ctx: any) => {
				workerExecutionCount++
				const input = ctx.input
				return { output: `processed_${input.id}_${input.data}` }
			}
			const flow = createFlow('batch-test')
			flow.node('prepare', async () => ({
				output: [
					{ id: 1, data: 'item1' },
					{ id: 2, data: 'item2' },
					{ id: 3, data: 'item3' },
				],
			}))
			flow.node('verify', async (ctx) => {
				const results = ctx.input
				expect(results).toHaveLength(3)
				expect(results).toEqual(['processed_1_item1', 'processed_2_item2', 'processed_3_item3'])
				return { output: 'verified' }
			})
			flow.batch('test-batch', workerFunction, {
				inputKey: 'prepare',
				outputKey: 'results',
			})
			flow.edge('prepare', 'test-batch')
			flow.edge('test-batch', 'verify')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			if (result.status !== 'completed') {
				console.log('Errors:', result.errors)
			}
			console.log('Final context:', result.context)
			expect(result.status).toBe('completed')
			expect(result.context['_outputs.verify']).toBe('verified')
			expect(workerExecutionCount).toBe(3)
		})

		it('should handle empty batch input array', async () => {
			const workerFunction = async () => {
				throw new Error('Worker should not execute')
			}
			const flow = createFlow('empty-batch-test')
			flow.node('prepare', async () => ({ output: [] }))
			flow.node('verify', async (ctx) => {
				const results = ctx.input
				expect(results).toEqual([])
				return { output: 'verified' }
			})
			flow.batch('test-batch', workerFunction, {
				inputKey: 'prepare',
				outputKey: 'results',
			})
			flow.edge('prepare', 'test-batch')
			flow.edge('test-batch', 'verify')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.verify']).toBe('verified')
		})

		it('should handle worker failures in batch', async () => {
			let workerExecutionCount = 0
			const workerFunction = async (ctx: any) => {
				workerExecutionCount++
				const input = ctx.input
				if (input.id === 2) {
					throw new Error('Worker 2 failed')
				}
				return { output: `processed_${input.id}_${input.data}` }
			}
			const flow = createFlow('batch-fail-test')
			flow.node('prepare', async () => ({
				output: [
					{ id: 1, data: 'item1' },
					{ id: 2, data: 'item2' },
				],
			}))
			flow.node('verify', async (ctx) => {
				const results = await ctx.context.get('results')
				expect(results).toHaveLength(1)
				expect(results[0]).toBe('processed_1_item1')
				return { output: 'verified' }
			})
			flow.batch('test-batch', workerFunction, {
				inputKey: 'prepare',
				outputKey: 'results',
			})
			flow.edge('prepare', 'test-batch')
			flow.edge('test-batch', 'verify')

			const runtime = new FlowRuntime({})
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('failed')
			expect(result.errors?.length).toBeGreaterThan(0)
			expect(result.errors?.[0]?.message).toContain('execution failed')
			expect(workerExecutionCount).toBe(2)
		})
	})

	describe('Loop Controller', () => {
		it('should correctly exit a simple loop with an intuitive edge definition', async () => {
			const flow = createFlow('simple-loop-exit-test')
				.node('initialize', async ({ context }) => {
					await context.set('count', 0)
					return { output: 'Initialized' }
				})
				.node('increment', async ({ context }) => {
					const currentCount = (await context.get('count')) || 0
					const newCount = currentCount + 1
					await context.set('count', newCount)
					return { output: newCount }
				})
				.loop('counter', {
					startNodeId: 'increment',
					endNodeId: 'increment',
					condition: 'count < 5',
				})
				.node('finalize', async ({ context }) => {
					const finalCount = await context.get('count')
					return { output: `Finalized at ${finalCount}` }
				})
				.edge('initialize', 'increment')
				// The intuitive edge that now works, replacing the need for .edge('counter-loop', 'finalize')
				.edge('increment', 'finalize')

			const runtime = new FlowRuntime({ evaluator: new UnsafeEvaluator() })
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.finalize']).toBe('Finalized at 5')
			expect(result.context.count).toBe(5)
		})

		it('should execute loop for specified iterations and break correctly', async () => {
			let executionCount = 0
			const flow = createFlow('loop-iterations-test')
				.node('initialize', async ({ context }) => {
					await context.set('counter', 0)
					return { output: 'initialized' }
				})
				.node('increment', async ({ context }) => {
					executionCount++
					const counter = (await context.get('counter')) || 0
					await context.set('counter', counter + 1)
					return { output: `iteration_${counter + 1}` }
				})
				.node('check', async ({ context }) => {
					const counter = (await context.get('counter')) || 0
					return { output: `checked_${counter}` }
				})
				.node('final', async () => ({ output: 'final' }))
				.edge('initialize', 'increment')
				.edge('increment', 'check')
				.loop('test-loop', {
					startNodeId: 'increment',
					endNodeId: 'check',
					condition: 'counter < 3',
				})
				// This intuitive edge from the loop's end node ('check') now correctly wires the exit.
				.edge('check', 'final')

			const runtime = new FlowRuntime({ evaluator: new UnsafeEvaluator() })
			const result = await runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.final']).toBe('final')
			expect(executionCount).toBe(3)
		})

		it('should handle infinite loop prevention', async () => {
			const flow = createFlow('infinite-loop-test')
				.node('always-true', async () => ({ output: 'continue' }))
				.node('work', async () => ({ output: 'work' }))
				.loop('test-loop', {
					startNodeId: 'work',
					endNodeId: 'always-true',
					condition: 'true', // This condition will always be met
				})
				.edge('work', 'always-true')
			// No break/exit edge is defined, so the workflow should loop until the safety limit is hit.

			const runtime = new FlowRuntime({ evaluator: new UnsafeEvaluator() })
			await expect(
				runtime.run(flow.toBlueprint(), {}, { functionRegistry: flow.getFunctionRegistry() }),
			).rejects.toThrow('Traversal exceeded maximum iterations')
		})
	})

	describe('Subflow', () => {
		it('should execute subflow and merge context correctly', async () => {
			const mainFlow = createFlow('main-subflow-test')
			mainFlow.node('input', async () => ({ output: { value: 'test' } }))
			mainFlow.node('output', async (ctx) => {
				const subflowResult = await ctx.context.get('subflow_output')
				expect(subflowResult).toBe('processed_test')
				return { output: 'main_complete' }
			})
			mainFlow.edge('input', 'test-subflow')
			mainFlow.edge('test-subflow', 'output')
			mainFlow.node('test-subflow', SubflowNode, {
				params: {
					blueprintId: 'subflow-test',
					inputs: { input: 'input' },
					outputs: { subflow_output: 'process' },
				},
			})

			const subFlow = createFlow('subflow-test')
			subFlow.node(
				'process',
				async (ctx) => {
					const input = ctx.input
					return { output: `processed_${input.value}` }
				},
				{ inputs: 'input' },
			)

			const blueprint = mainFlow.toBlueprint()
			const combinedRegistry = new Map([...mainFlow.getFunctionRegistry(), ...subFlow.getFunctionRegistry()])
			const runtime = new FlowRuntime({
				blueprints: { 'subflow-test': subFlow.toBlueprint() },
			})
			const result = await runtime.run(blueprint, {}, { functionRegistry: combinedRegistry })

			expect(result.status).toBe('completed')
			expect(result.context['_outputs.output']).toBe('main_complete')
		})

		it('should handle subflow errors and propagate them', async () => {
			const mainFlow = createFlow('subflow-error-test')
			mainFlow.node('input', async () => ({ output: 'test' }))
			mainFlow.node('test-subflow', SubflowNode, {
				params: {
					blueprintId: 'failing-subflow',
					inputs: { input: 'input' },
				},
			})
			mainFlow.edge('input', 'test-subflow')

			const subFlow = createFlow('failing-subflow')
			subFlow.node('fail', async () => {
				throw new Error('Subflow failed')
			})

			const blueprint2 = mainFlow.toBlueprint()
			const combinedRegistry2 = new Map([...mainFlow.getFunctionRegistry(), ...subFlow.getFunctionRegistry()])
			const runtime = new FlowRuntime({
				blueprints: { 'failing-subflow': subFlow.toBlueprint() },
			})
			const result = await runtime.run(blueprint2, {}, { functionRegistry: combinedRegistry2 })

			expect(result.status).toBe('failed')
			expect(result.errors?.some((e) => e.message?.includes("Node 'fail' execution failed"))).toBe(true)
		})
	})
})

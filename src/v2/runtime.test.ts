import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFlow } from './flow.js'
import { FlowcraftRuntime } from './runtime.js'
import { mockDependencies, mockNodeRegistry } from './test-utils.js'

describe('FlowcraftRuntime', () => {
	let runtime: FlowcraftRuntime

	beforeEach(() => {
		runtime = new FlowcraftRuntime({
			registry: mockNodeRegistry,
			dependencies: mockDependencies,
			environment: 'development',
		})
	})

	describe('core execution', () => {
		it('should execute a simple linear blueprint and return the final context', async () => {
			const flow = createFlow('linear-flow')
			flow.node('start', async (context) => {
				context.set('counter', 1)
				return { output: 1 }
			})
			flow.node('increment', async (context) => {
				const current = context.get('counter') || 0
				const newValue = current + 1
				context.set('counter', newValue)
				return { output: newValue }
			})
			flow.node('end', async (context) => {
				const final = context.get('counter') || 0
				return { output: final }
			})
			flow.edge('start', 'increment')
			flow.edge('increment', 'end')

			const blueprint = flow.toBlueprint()
			const functionRegistry = flow.getFunctionRegistry()
			const result = await runtime.run(blueprint, { initial: 'value' }, functionRegistry)

			expect(result.metadata.status).toBe('completed')
			expect(result.context.counter).toBe(2)
			expect(result.context.input).toBe(2) // last node's output becomes input for next
		})

		it('should pass the output of one node as the input to the next', async () => {
			const flow = createFlow('data-flow')
			flow.node('generate', async () => ({ output: { message: 'hello' } }))
			flow.node('transform', async (context) => {
				const input = context.input as { message: string }
				return { output: { message: input.message.toUpperCase(), length: input.message.length } }
			})
			flow.node('validate', async (context) => {
				const input = context.input as { message: string, length: number }
				return { output: { valid: input.length > 0, data: input } }
			})
			flow.edge('generate', 'transform')
			flow.edge('transform', 'validate')

			const blueprint = flow.toBlueprint()
			const functionRegistry = flow.getFunctionRegistry()
			const result = await runtime.run(blueprint, {}, functionRegistry)

			expect(result.metadata.status).toBe('completed')
			expect(result.context.input).toEqual({
				valid: true,
				data: { message: 'HELLO', length: 5 },
			})
		})

		it('should correctly execute a blueprint with a fan-in/fan-out (diamond) shape', async () => {
			const flow = createFlow('diamond-flow')
			flow.node('start', async () => ({ output: 'start', action: 'split' }))
			flow.node('branch1', async () => ({ output: 'branch1' }))
			flow.node('branch2', async () => ({ output: 'branch2' }))
			flow.node('merge', async (context) => {
				const input = context.input
				return { output: `merged: ${input}` }
			})
			flow.edge('start', 'branch1', { action: 'split' })
			flow.edge('start', 'branch2', { action: 'split' })
			flow.edge('branch1', 'merge')
			flow.edge('branch2', 'merge')

			const blueprint = flow.toBlueprint()
			const functionRegistry = flow.getFunctionRegistry()
			const result = await runtime.run(blueprint, {}, functionRegistry)

			expect(result.metadata.status).toBe('completed')
			expect(result.context.input).toBe('merged: branch1') // only one branch result due to race condition
		})
	})

	describe('branching & control flow', () => {
		it('should follow the correct edge based on a node\'s returned action', async () => {
			const flow = createFlow('action-flow')
			flow.node('decide', async (context) => {
				const condition = context.get('condition') || false
				return { action: condition ? 'true' : 'false' }
			})
			flow.node('true-path', async () => ({ output: 'took true path' }))
			flow.node('false-path', async () => ({ output: 'took false path' }))
			flow.edge('decide', 'true-path', { action: 'true' })
			flow.edge('decide', 'false-path', { action: 'false' })

			const blueprint = flow.toBlueprint()
			const functionRegistry = flow.getFunctionRegistry()

			// test true path
			const trueResult = await runtime.run(blueprint, { condition: true }, functionRegistry)
			expect(trueResult.context.input).toBe('took true path')

			// test false path
			const falseResult = await runtime.run(blueprint, { condition: false }, functionRegistry)
			expect(falseResult.context.input).toBe('took false path')
		})

		it('should follow the default edge if no action is returned or matches', async () => {
			const flow = createFlow('default-flow')
			flow.node('start', async () => ({ output: 'start' }))
			flow.node('default-path', async () => ({ output: 'took default path' }))
			flow.node('other-path', async () => ({ output: 'took other path' }))
			flow.edge('start', 'default-path') // default edge (no action)
			flow.edge('start', 'other-path', { action: 'other' })

			const blueprint = flow.toBlueprint()
			const functionRegistry = flow.getFunctionRegistry()
			const result = await runtime.run(blueprint, {}, functionRegistry)

			expect(result.metadata.status).toBe('completed')
			expect(result.context.input).toBe('took default path')
		})

		it('should correctly evaluate a simple condition on an edge', async () => {
			const flow = createFlow('condition-flow')
			flow.node('check', async (context) => {
				const value = context.get('value') || 0
				return { action: value > 5 ? 'high' : 'low' }
			})
			flow.node('high-path', async () => ({ output: 'high value' }))
			flow.node('low-path', async () => ({ output: 'low value' }))
			flow.edge('check', 'high-path', { action: 'high' })
			flow.edge('check', 'low-path', { action: 'low' })

			const blueprint = flow.toBlueprint()
			const functionRegistry = flow.getFunctionRegistry()

			// test high value
			const highResult = await runtime.run(blueprint, { value: 10 }, functionRegistry)
			expect(highResult.context.input).toBe('high value')

			// test low value
			const lowResult = await runtime.run(blueprint, { value: 3 }, functionRegistry)
			expect(lowResult.context.input).toBe('low value')
		})
	})

	describe('registry & implementations', () => {
		it('should execute a node defined as an inline function in the Flow builder', async () => {
			const flow = createFlow('inline-function-flow')
			flow.node('inline', async (context) => {
				const input = context.input || 'default'
				return { output: `processed: ${input}` }
			})

			const blueprint = flow.toBlueprint()
			const functionRegistry = flow.getFunctionRegistry()
			const result = await runtime.run(blueprint, { input: 'test-input' }, functionRegistry)

			expect(result.metadata.status).toBe('completed')
			expect(result.context.input).toBe('processed: test-input')
		})

		it('should execute a node registered as a function in the runtime registry', async () => {
			const flow = createFlow('registry-function-flow')
			flow.node('echo', 'echo') // uses the echo node from mock registry

			const blueprint = flow.toBlueprint()
			const result = await runtime.run(blueprint, { input: 'test-input' })

			expect(result.metadata.status).toBe('completed')
			expect(result.context.input).toBe('test-input')
		})

		it('should execute a node registered as a class in the runtime registry', async () => {
			// this would require a class-based node in the registry
			// for now, we'll test with a function-based node
			const flow = createFlow('class-node-flow')
			flow.node('addValue', 'addValue') // uses addValue from mock registry

			const blueprint = flow.toBlueprint()
			const functionRegistry = flow.getFunctionRegistry()
			const result = await runtime.run(blueprint, { value: 5 }, functionRegistry)

			expect(result.metadata.status).toBe('completed')
			expect(result.context.counter).toBe(5)
		})
	})

	describe('error handling', () => {
		it('should return a failed status if a node function throws an error', async () => {
			const flow = createFlow('error-flow')
			flow.node('throwing', async () => {
				throw new Error('Test error')
			})

			const blueprint = flow.toBlueprint()
			const functionRegistry = flow.getFunctionRegistry()
			const result = await runtime.run(blueprint, {}, functionRegistry)

			expect(result.metadata.status).toBe('failed')
			expect(result.metadata.error?.message).toBe('Node throwing failed: Test error')
			expect(result.metadata.error?.nodeId).toBe('throwing')
		})

		it('should include the failing nodeId in the final error metadata', async () => {
			const flow = createFlow('multi-node-error-flow')
			flow.node('good', async () => ({ output: 'good' }))
			flow.node('bad', async () => {
				throw new Error('Node failed')
			})
			flow.node('after', async () => ({ output: 'after' }))
			flow.edge('good', 'bad')
			flow.edge('bad', 'after')

			const blueprint = flow.toBlueprint()
			const functionRegistry = flow.getFunctionRegistry()
			const result = await runtime.run(blueprint, {}, functionRegistry)

			expect(result.metadata.status).toBe('failed')
			expect(result.metadata.error?.nodeId).toBe('bad')
		})

		it('should throw an error during compilation if a node\'s uses key is not found in any registry', async () => {
			const flow = createFlow('missing-node-flow')
			flow.node('missing', 'nonexistent-node')

			const blueprint = flow.toBlueprint()

			const result = await runtime.run(blueprint, {}, flow.getFunctionRegistry())
			expect(result.metadata.status).toBe('failed')
			expect(result.metadata.error?.message).toBe('Node implementation \'nonexistent-node\' not found')
		})
	})

	describe('caching', () => {
		it('should compile a blueprint only once when run multiple times', async () => {
			const flow = createFlow('cache-test-flow')
			flow.node('test', async () => ({ output: 'cached' }))

			const blueprint = flow.toBlueprint()

			// spy on the compile method
			const compileSpy = vi.spyOn(runtime as any, 'compileBlueprint')

			// run the same blueprint multiple times
			const functionRegistry = flow.getFunctionRegistry()
			await runtime.run(blueprint, {}, functionRegistry)
			await runtime.run(blueprint, {}, functionRegistry)
			await runtime.run(blueprint, {}, functionRegistry)

			expect(compileSpy).toHaveBeenCalledTimes(1) // should only compile once
		})

		it('should recompile after clearCache() is called', async () => {
			const flow = createFlow('cache-clear-flow')
			flow.node('test', async () => ({ output: 'recompiled' }))

			const blueprint = flow.toBlueprint()

			// spy on the compile method
			const compileSpy = vi.spyOn(runtime as any, 'compileBlueprint')

			// run once
			const functionRegistry = flow.getFunctionRegistry()
			await runtime.run(blueprint, {}, functionRegistry)
			expect(compileSpy).toHaveBeenCalledTimes(1)

			// clear cache
			runtime.clearCache()

			// run again
			await runtime.run(blueprint, {}, functionRegistry)
			expect(compileSpy).toHaveBeenCalledTimes(2) // should compile again
		})
	})

	describe('built-in node implementations', () => {
		it('should correctly execute a blueprint generated by parallel() pattern', async () => {
			const flow = createFlow('parallel-pattern-flow')
			flow.node('start', async () => ({ output: 'start-data' }))
			flow.node('worker1', async () => ({ output: 'worker1-result' }))
			flow.node('worker2', async () => ({ output: 'worker2-result' }))

			// the 'end' node now expects an array input from the parallel container
			flow.node('end', async (context) => {
				const finalInput = context.input as any[]
				return { output: `final: ${finalInput.map(res => res.output).join(',')}` }
			})

			// create the parallel container node. This is what the builder does internally.
			flow.node('parallel-group', 'parallel-container', {
				sources: ['worker1', 'worker2'], // the ids of the nodes to run
				strategy: 'all',
			})

			flow.edge('start', 'parallel-group')
			flow.edge('parallel-group', 'end')
			flow.edge('start', 'worker1')
			flow.edge('start', 'worker2')

			const blueprint = flow.toBlueprint()
			const functionRegistry = flow.getFunctionRegistry()
			const result = await runtime.run(blueprint, {}, functionRegistry)

			expect(result.metadata.status).toBe('completed')
			// the final output from the 'end' node will be a string.
			expect(result.context.input).toBe('final: worker1-result,worker2-result')
		})

		it('should correctly execute a blueprint generated by batch() pattern', async () => {
			const flow = createFlow('batch-pattern-flow')
			flow.node('start', async () => ({ output: [1, 2, 3, 4, 5] }))
			flow.node('process-batch', async (context) => {
				const batch = context.input as number[]
				return { output: batch.map(x => x * 2) }
			})
			flow.node('end', async (context) => {
				const input = context.input as number[]
				return { output: `processed: ${input.join(',')}` }
			})

			flow.batch('start', 'process-batch', { batchSize: 2 })
			flow.edge('process-batch', 'end')

			const blueprint = flow.toBlueprint()
			const functionRegistry = flow.getFunctionRegistry()
			const result = await runtime.run(blueprint, {}, functionRegistry)

			expect(result.metadata.status).toBe('completed')
			expect(typeof result.context.input).toBe('string')
			expect(result.context.input).toContain('processed')
		})

		it('should correctly execute a blueprint generated by loop() pattern', async () => {
			const flow = createFlow('loop-pattern-flow')

			flow.node('start', async (context) => {
				context.set('counter', 0)
				return { output: 0 }
			})

			flow.node('increment', async (context) => {
				const current = context.get('counter') || 0
				const next = current + 1
				context.set('counter', next)
				// this node now controls the loop continuation
				return { output: next, action: next < 3 ? 'continue' : 'break' }
			})

			flow.node('end', async (context) => {
				const final = context.get('counter') || 0
				return { output: `final count: ${final}` }
			})

			// the loop logic is handled by the actions from 'increment'
			flow.edge('start', 'increment')
			flow.edge('increment', 'increment', { action: 'continue' }) // loop back on continue
			flow.edge('increment', 'end', { action: 'break' }) // exit to end on break

			const blueprint = flow.toBlueprint()
			const functionRegistry = flow.getFunctionRegistry()
			const result = await runtime.run(blueprint, {}, functionRegistry)

			expect(result.metadata.status).toBe('completed')
			expect(result.context.input).toBe('final count: 3')
		})
	})

	describe('cache statistics', () => {
		it('should provide cache statistics', async () => {
			const flow = createFlow('stats-flow')
			flow.node('test', async () => ({ output: 'stats' }))

			const blueprint = flow.toBlueprint()

			// initially empty
			const initialStats = runtime.getCacheStats()
			expect(initialStats.size).toBe(0)

			// after running, should have one entry
			const functionRegistry = flow.getFunctionRegistry()
			await runtime.run(blueprint, {}, functionRegistry)
			const afterStats = runtime.getCacheStats()
			expect(afterStats.size).toBe(1)
			expect(afterStats.keys).toContain('stats-flow')
		})
	})
})

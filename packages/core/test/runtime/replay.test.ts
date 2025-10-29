import { describe, expect, it } from 'vitest'
import { InMemoryEventStore, PersistentEventBusAdapter } from '../../src/adapters/persistent-event-bus'
import { createFlow } from '../../src/flow'
import { FlowRuntime } from '../../src/runtime/runtime'
import { InMemoryEventLogger } from '../../src/testing/event-logger'

describe('Workflow Replay', () => {
	describe('Basic Replay Functionality', () => {
		it('should replay a simple linear workflow', async () => {
			const flow = createFlow('simple-replay')
				.node('start', async () => ({ output: 'hello' }))
				.node('process', async ({ input }) => ({ output: `${input} world` }))
				.edge('start', 'process')

			const blueprint = flow.toBlueprint()
			const registry = flow.getFunctionRegistry()

			const eventStore = new InMemoryEventStore()
			const eventBus = new PersistentEventBusAdapter(eventStore)
			const runtime = new FlowRuntime({ eventBus })

			const result = await runtime.run(blueprint, {}, { functionRegistry: registry })
			expect(result.status).toBe('completed')
			expect(result.context).toHaveProperty('_outputs.process', 'hello world')

			const executionId = result.context._executionId as string
			const events = await eventStore.retrieve(executionId)

			// Verify events were recorded
			expect(events.length).toBeGreaterThan(0)
			expect(events.some((e) => e.type === 'workflow:start')).toBe(true)
			expect(events.some((e) => e.type === 'node:finish')).toBe(true)

			const replayResult = await runtime.replay(blueprint, events, executionId)
			expect(replayResult.status).toBe('completed')
			expect(replayResult.context).toEqual(result.context)
		})

		it('should replay workflows with conditional logic', async () => {
			const flow = createFlow('conditional-replay')
				.node('decider', async () => ({
					output: { value: 75 },
					action: 'high', // Deterministic choice
				}))
				.node('high-path', async () => ({ output: 'high-priority' }))
				.node('low-path', async () => ({ output: 'low-priority' }))
				.edge('decider', 'high-path', { action: 'high' })
				.edge('decider', 'low-path', { action: 'low' })

			const blueprint = flow.toBlueprint()
			const registry = flow.getFunctionRegistry()

			const eventStore = new InMemoryEventStore()
			const eventBus = new PersistentEventBusAdapter(eventStore)
			const runtime = new FlowRuntime({ eventBus })

			const result = await runtime.run(blueprint, {}, { functionRegistry: registry })
			expect(result.status).toBe('completed')
			expect(result.context['_outputs.high-path']).toBe('high-priority')
			expect(result.context['_outputs.low-path']).toBeUndefined()

			const executionId = result.context._executionId as string
			const events = await eventStore.retrieve(executionId)
			const replayResult = await runtime.replay(blueprint, events, executionId)

			expect(replayResult.status).toBe('completed')
			expect(replayResult.context['_outputs.decider']).toEqual({ value: 75 })
			expect(replayResult.context['_outputs.high-path']).toBe('high-priority')
			expect(replayResult.context['_outputs.low-path']).toBeUndefined()
		})
	})

	describe('Context State Reconstruction', () => {
		it('should correctly reconstruct complex context state', async () => {
			const flow = createFlow('context-reconstruction')
				.node('setup', async ({ context }) => {
					await context.set('user', { id: 123, name: 'Alice' })
					await context.set('items', [])
					return { output: 'setup' }
				})
				.node('process', async ({ context }) => {
					const user = await context.get('user')
					const items = await context.get('items')
					items.push({ id: 1, name: 'Item 1', owner: user.id })
					await context.set('items', items)
					await context.set('processed', true)
					return { output: 'processed' }
				})
				.edge('setup', 'process')

			const blueprint = flow.toBlueprint()
			const registry = flow.getFunctionRegistry()

			const eventStore = new InMemoryEventStore()
			const eventBus = new PersistentEventBusAdapter(eventStore)
			const runtime = new FlowRuntime({ eventBus })

			const result = await runtime.run(blueprint, {}, { functionRegistry: registry })
			expect(result.status).toBe('completed')
			expect(result.context.processed).toBe(true)
			expect(result.context.items).toHaveLength(1)

			const executionId = result.context._executionId as string
			const events = await eventStore.retrieve(executionId)
			const replayResult = await runtime.replay(blueprint, events, executionId)

			expect(replayResult.status).toBe('completed')
			expect(replayResult.context.user.name).toBe('Alice')
			expect(replayResult.context.items).toHaveLength(1)
			expect(replayResult.context.processed).toBe(true)
		})

		it('should handle context set and delete operations', async () => {
			const flow = createFlow('delete-flow').node('modify-context', async ({ context }) => {
				await context.set('temp', 'temporary value')
				await context.set('permanent', 'kept value')
				await context.delete('temp') // Delete the temporary value
				return { output: 'done' }
			})

			const blueprint = flow.toBlueprint()
			const registry = flow.getFunctionRegistry()

			const eventStore = new InMemoryEventStore()
			const eventBus = new PersistentEventBusAdapter(eventStore)
			const runtime = new FlowRuntime({ eventBus })

			const result = await runtime.run(blueprint, {}, { functionRegistry: registry })

			// Verify original execution
			expect(result.context.permanent).toBe('kept value')
			expect(result.context.temp).toBeUndefined()

			const executionId = result.context._executionId as string
			const events = await eventStore.retrieve(executionId)
			const replayResult = await runtime.replay(blueprint, events, executionId)

			// Verify replay reconstructed the state correctly
			expect(replayResult.context.permanent).toBe('kept value')
			expect(replayResult.context.temp).toBeUndefined()
			expect(replayResult.context).toEqual(result.context)
		})
	})

	describe('Error Handling and Recovery', () => {
		it('should replay workflows that had errors', async () => {
			const flow = createFlow('error-replay')
				.node('working', async () => ({ output: 'working' }))
				.node('failing', async () => {
					throw new Error('Test error')
				})
				.edge('working', 'failing')

			const blueprint = flow.toBlueprint()
			const registry = flow.getFunctionRegistry()

			const eventStore = new InMemoryEventStore()
			const eventBus = new PersistentEventBusAdapter(eventStore)
			const runtime = new FlowRuntime({ eventBus })

			const result = await runtime.run(blueprint, {}, { functionRegistry: registry })
			expect(result.status).toBe('failed')
			expect(result.errors).toBeDefined()
			expect(result.errors?.length).toBeGreaterThan(0)

			const executionId = result.context._executionId as string
			const events = await eventStore.retrieve(executionId)
			const replayResult = await runtime.replay(blueprint, events, executionId)

			// Replay always completes since it reconstructs final state
			expect(replayResult.status).toBe('completed')
			expect(replayResult.context['_outputs.working']).toBe('working')
		})

		it('should handle node fallback events', async () => {
			const flow = createFlow('fallback-flow')
				.node('unreliable', async () => {
					throw new Error('Primary failed')
				})
				.node('fallback-handler', async () => {
					return { output: 'fallback result' }
				})

			// Manually configure fallback in the blueprint
			const blueprint = flow.toBlueprint()
			const unreliableNode = blueprint.nodes.find((n) => n.id === 'unreliable')
			if (unreliableNode) {
				unreliableNode.config = { ...unreliableNode.config, fallback: 'fallback-handler' }
			}

			const registry = flow.getFunctionRegistry()

			const eventStore = new InMemoryEventStore()
			const eventBus = new PersistentEventBusAdapter(eventStore)
			const runtime = new FlowRuntime({ eventBus })

			const result = await runtime.run(blueprint, {}, { functionRegistry: registry })
			const executionId = result.context._executionId as string

			const events = await eventStore.retrieve(executionId)
			const replayResult = await runtime.replay(blueprint, events, executionId)

			expect(replayResult.status).toBe('completed')
			expect(replayResult.context).toHaveProperty('_outputs.unreliable', 'fallback result')
		})

		it('should handle node retry events', async () => {
			let attempts = 0
			const flow = createFlow('retry-flow').node(
				'flaky',
				async () => {
					attempts++
					if (attempts < 2) {
						throw new Error('Temporary failure')
					}
					return { output: 'success' }
				},
				{
					config: { maxRetries: 2 },
				},
			)

			const blueprint = flow.toBlueprint()
			const registry = flow.getFunctionRegistry()

			const eventStore = new InMemoryEventStore()
			const eventBus = new PersistentEventBusAdapter(eventStore)
			const runtime = new FlowRuntime({ eventBus })

			const result = await runtime.run(blueprint, {}, { functionRegistry: registry })
			const executionId = result.context._executionId as string

			const events = await eventStore.retrieve(executionId)
			const replayResult = await runtime.replay(blueprint, events, executionId)

			expect(replayResult.status).toBe('completed')
			expect(replayResult.context).toEqual(result.context)
		})
	})

	describe('Advanced Workflow Patterns', () => {
		it('should handle workflow stall events', async () => {
			const flow = createFlow('stall-flow')
				.node('start', async () => ({ output: 'start' }))
				.node('sleep', async ({ dependencies }) => {
					await dependencies.workflowState.markAsAwaiting('sleep', {
						reason: 'timer',
						wakeUpAt: new Date(Date.now() + 1000).toISOString(),
					})
					return { output: 'sleeping' }
				})
				.edge('start', 'sleep')

			const blueprint = flow.toBlueprint()
			const registry = flow.getFunctionRegistry()

			const eventStore = new InMemoryEventStore()
			const eventBus = new PersistentEventBusAdapter(eventStore)
			const runtime = new FlowRuntime({ eventBus })

			const result = await runtime.run(blueprint, {}, { functionRegistry: registry })
			const executionId = result.context._executionId as string

			const events = await eventStore.retrieve(executionId)
			const replayResult = await runtime.replay(blueprint, events, executionId)

			// Replay reconstructs final state, so it shows completed even if original was awaiting
			expect(replayResult.status).toBe('completed')
			expect(replayResult.context._outputs).toEqual(result.context._outputs)
		})

		it('should handle batch operations in replay', async () => {
			const flow = createFlow('batch-flow').batch(
				'process-batch',
				async ({ input }) => ({ output: (input as string).toUpperCase() }),
				{
					inputKey: 'items',
					outputKey: 'results',
				},
			)

			const blueprint = flow.toBlueprint()
			const registry = flow.getFunctionRegistry()

			const eventStore = new InMemoryEventStore()
			const eventBus = new PersistentEventBusAdapter(eventStore)
			const runtime = new FlowRuntime({ eventBus })

			const result = await runtime.run(blueprint, { items: ['hello', 'world'] }, { functionRegistry: registry })
			const executionId = result.context._executionId as string

			const events = await eventStore.retrieve(executionId)
			const replayResult = await runtime.replay(blueprint, events, executionId)

			expect(replayResult.status).toBe('completed')
			expect(replayResult.context.results).toEqual(['HELLO', 'WORLD'])
			expect(replayResult.context._outputs).toEqual(result.context._outputs)
		})

		it('should handle conditional edges', async () => {
			const flow = createFlow('conditional-flow')
				.node('check', async () => ({ output: true }))
				.node('true-path', async () => ({ output: 'taken' }))
				.node('false-path', async () => ({ output: 'not taken' }))
				.edge('check', 'true-path', { condition: 'output === true' })
				.edge('check', 'false-path', { condition: 'output === false' })

			const blueprint = flow.toBlueprint()
			const registry = flow.getFunctionRegistry()

			const eventStore = new InMemoryEventStore()
			const eventBus = new PersistentEventBusAdapter(eventStore)
			const runtime = new FlowRuntime({ eventBus })

			const result = await runtime.run(blueprint, {}, { functionRegistry: registry })
			const executionId = result.context._executionId as string

			const events = await eventStore.retrieve(executionId)
			const replayResult = await runtime.replay(blueprint, events, executionId)

			expect(replayResult.status).toBe('completed')
			expect(replayResult.context).toEqual(result.context)
		})
	})

	describe('Event Processing and Filtering', () => {
		it('should filter events by executionId', async () => {
			const flow = createFlow('filter-test').node('simple', async () => ({ output: 'test' }))

			const blueprint = flow.toBlueprint()
			const registry = flow.getFunctionRegistry()

			const eventStore = new InMemoryEventStore()
			const eventBus = new PersistentEventBusAdapter(eventStore)
			const runtime = new FlowRuntime({ eventBus })

			const result = await runtime.run(blueprint, {}, { functionRegistry: registry })
			const executionId = result.context._executionId as string

			const events = await eventStore.retrieve(executionId)
			// Add an event with different executionId to test the filter
			events.push({
				type: 'workflow:start',
				payload: { blueprintId: 'other', executionId: 'different-execution-id' },
			})

			const replayResult = await runtime.replay(blueprint, events, executionId)

			expect(replayResult.status).toBe('completed')
			expect(replayResult.context).toEqual(result.context)
		})

		it('should handle unknown event types gracefully', async () => {
			const flow = createFlow('unknown-event-flow').node('simple', async () => ({ output: 'test' }))

			const blueprint = flow.toBlueprint()
			const registry = flow.getFunctionRegistry()

			const eventStore = new InMemoryEventStore()
			const eventBus = new PersistentEventBusAdapter(eventStore)
			const runtime = new FlowRuntime({ eventBus })

			const result = await runtime.run(blueprint, {}, { functionRegistry: registry })
			const executionId = result.context._executionId as string

			const events = await eventStore.retrieve(executionId)
			// Add an unknown event type
			events.push({
				type: 'unknown:event' as any,
				payload: { executionId, someData: 'test' } as any,
			})

			const replayResult = await runtime.replay(blueprint, events, executionId)

			expect(replayResult.status).toBe('completed')
			expect(replayResult.context).toEqual(result.context)
		})
	})

	describe('Integration and Compatibility', () => {
		it('should work with InMemoryEventLogger for testing', async () => {
			const flow = createFlow('logger-flow').node('simple', async () => ({ output: 'test' }))

			const blueprint = flow.toBlueprint()
			const registry = flow.getFunctionRegistry()

			// Use InMemoryEventLogger (existing testing utility)
			const eventLogger = new InMemoryEventLogger()
			const runtime = new FlowRuntime({ eventBus: eventLogger })

			const result = await runtime.run(blueprint, {}, { functionRegistry: registry })
			const executionId = result.context._executionId as string

			// Convert logger events to the format expected by replay
			const events = eventLogger.events

			const replayResult = await runtime.replay(blueprint, events, executionId)

			expect(replayResult.status).toBe('completed')
			expect(replayResult.context).toEqual(result.context)
		})
	})

	describe('Edge Cases and Robustness', () => {
		it('should handle empty event streams', async () => {
			const flow = createFlow('empty-events').node('test', async () => ({ output: 'test' }))

			const blueprint = flow.toBlueprint()
			const _registry = flow.getFunctionRegistry()

			const runtime = new FlowRuntime({})
			const replayResult = await runtime.replay(blueprint, [], 'test-execution-id')

			expect(replayResult.status).toBe('completed')
			expect(replayResult.context).toEqual({})
		})

		it('should handle concurrent replay operations', async () => {
			const flow = createFlow('concurrent-replay').node('shared', async ({ context }) => {
				await context.set('shared_value', Math.random())
				return { output: 'shared' }
			})

			const blueprint = flow.toBlueprint()
			const registry = flow.getFunctionRegistry()

			const eventStore = new InMemoryEventStore()
			const eventBus = new PersistentEventBusAdapter(eventStore)
			const runtime = new FlowRuntime({ eventBus })

			const result = await runtime.run(blueprint, {}, { functionRegistry: registry })
			const executionId = result.context._executionId as string
			const events = await eventStore.retrieve(executionId)

			// Run multiple replays concurrently
			const replayPromises = Array.from({ length: 5 }, () => runtime.replay(blueprint, events, executionId))
			const results = await Promise.all(replayPromises)

			results.forEach((replayResult) => {
				expect(replayResult.status).toBe('completed')
				expect(replayResult.context['_outputs.shared']).toBe('shared')
			})
		})
	})
})

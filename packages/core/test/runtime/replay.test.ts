import { describe, expect, it } from 'vitest'
import { InMemoryEventStore, PersistentEventBusAdapter } from '../../src/adapters/persistent-event-bus'
import { createFlow } from '../../src/flow'
import { FlowRuntime } from '../../src/runtime/runtime'
import { InMemoryEventLogger } from '../../src/testing/event-logger'

describe('Workflow Replay', () => {
	it('should replay a simple workflow execution', async () => {
		// Create a simple workflow
		const flow = createFlow('test-flow')
			.node('start', async () => ({ output: 'hello' }))
			.node('process', async ({ input }) => ({ output: `${input} world` }))
			.edge('start', 'process')

		const blueprint = flow.toBlueprint()
		const registry = flow.getFunctionRegistry()

		// Run the workflow with event logging
		const eventStore = new InMemoryEventStore()
		const eventBus = new PersistentEventBusAdapter(eventStore)
		const runtime = new FlowRuntime({ eventBus })

		const result = await runtime.run(blueprint, {}, { functionRegistry: registry })

		expect(result.status).toBe('completed')
		expect(result.context).toHaveProperty('_outputs.process', 'hello world')

		// Get the recorded events
		const executionId = result.context._executionId as string
		const events = await eventStore.retrieve(executionId)

		// Verify events were recorded
		expect(events.length).toBeGreaterThan(0)
		expect(events.some((e) => e.type === 'workflow:start')).toBe(true)
		expect(events.some((e) => e.type === 'node:finish')).toBe(true)

		// Replay the execution
		const replayResult = await runtime.replay(blueprint, events, executionId)

		// Verify replay produces the same result
		expect(replayResult.status).toBe('completed')
		expect(replayResult.context).toEqual(result.context)
	})

	it('should replay workflow with context changes', async () => {
		const flow = createFlow('context-flow').node('set-data', async ({ context }) => {
			await context.set('user', { name: 'Alice', age: 30 })
			await context.set('count', 42)
			return { output: 'data set' }
		})

		const blueprint = flow.toBlueprint()
		const registry = flow.getFunctionRegistry()

		// Run with logging
		const eventStore = new InMemoryEventStore()
		const eventBus = new PersistentEventBusAdapter(eventStore)
		const runtime = new FlowRuntime({ eventBus })

		const result = await runtime.run(blueprint, {}, { functionRegistry: registry })

		// Get events and replay
		const executionId = result.context._executionId as string
		const events = await eventStore.retrieve(executionId)
		const replayResult = await runtime.replay(blueprint, events, executionId)

		// Verify context was reconstructed
		expect(replayResult.context.user).toEqual({ name: 'Alice', age: 30 })
		expect(replayResult.context.count).toBe(42)
		expect(replayResult.context).toEqual(result.context)
	})

	it('should handle node errors in replay', async () => {
		const flow = createFlow('error-flow').node('failing-node', async () => {
			throw new Error('Test error')
		})

		const blueprint = flow.toBlueprint()
		const registry = flow.getFunctionRegistry()

		// Run with logging
		const eventStore = new InMemoryEventStore()
		const eventBus = new PersistentEventBusAdapter(eventStore)
		const runtime = new FlowRuntime({ eventBus })

		const result = await runtime.run(blueprint, {}, { functionRegistry: registry })
		const executionId = result.context._executionId as string

		// Get events and replay
		const events = await eventStore.retrieve(executionId)
		const replayResult = await runtime.replay(blueprint, events, executionId)

		// Replay should reconstruct the state up to the error
		expect(replayResult.status).toBe('completed') // Replay always shows as completed
	})

	it('should replay workflow with context set and delete operations', async () => {
		const flow = createFlow('delete-flow').node('modify-context', async ({ context }) => {
			await context.set('temp', 'temporary value')
			await context.set('permanent', 'kept value')
			await context.delete('temp') // Delete the temporary value
			return { output: 'done' }
		})

		const blueprint = flow.toBlueprint()
		const registry = flow.getFunctionRegistry()

		// Run with logging
		const eventStore = new InMemoryEventStore()
		const eventBus = new PersistentEventBusAdapter(eventStore)
		const runtime = new FlowRuntime({ eventBus })

		const result = await runtime.run(blueprint, {}, { functionRegistry: registry })

		// Verify original execution
		expect(result.context.permanent).toBe('kept value')
		expect(result.context.temp).toBeUndefined()

		// Get events and replay
		const executionId = result.context._executionId as string
		const events = await eventStore.retrieve(executionId)
		const replayResult = await runtime.replay(blueprint, events, executionId)

		// Verify replay reconstructed the state correctly
		expect(replayResult.context.permanent).toBe('kept value')
		expect(replayResult.context.temp).toBeUndefined()
		expect(replayResult.context).toEqual(result.context)
	})

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
		// Check that the outputs are reconstructed correctly
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
		// Replay reconstructs final state from events, so check key outputs
		expect(replayResult.context.results).toEqual(['HELLO', 'WORLD'])
		expect(replayResult.context._outputs).toEqual(result.context._outputs)
	})

	it('should handle node fallback events', async () => {
		// Create a flow with a primary node that fails and a fallback node
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

	it('should handle events without executionId', async () => {
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

	it('should handle unknown event types', async () => {
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

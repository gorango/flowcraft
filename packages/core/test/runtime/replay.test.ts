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
})

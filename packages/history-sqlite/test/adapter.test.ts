import type { FlowcraftEvent } from 'flowcraft'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteHistoryAdapter } from '../src/index.js'

describe('SqliteHistoryAdapter', () => {
	let adapter: SqliteHistoryAdapter

	beforeEach(() => {
		adapter = new SqliteHistoryAdapter({
			databasePath: ':memory:',
			walMode: false, // Not needed for in-memory
		})
	})

	afterEach(() => {
		adapter.close()
	})

	it('should store and retrieve events', async () => {
		const executionId = 'test-execution-1'
		const event: FlowcraftEvent = {
			type: 'workflow:start',
			payload: { blueprintId: 'test', executionId },
		}

		await adapter.store(event, executionId)
		const events = await adapter.retrieve(executionId)

		expect(events).toHaveLength(1)
		expect(events[0]).toEqual(event)
	})

	it('should retrieve multiple executions', async () => {
		const execution1 = 'exec-1'
		const execution2 = 'exec-2'

		const event1: FlowcraftEvent = {
			type: 'workflow:start',
			payload: { blueprintId: 'test1', executionId: execution1 },
		}

		const event2: FlowcraftEvent = {
			type: 'workflow:start',
			payload: { blueprintId: 'test2', executionId: execution2 },
		}

		await adapter.store(event1, execution1)
		await adapter.store(event2, execution2)

		const results = await adapter.retrieveMultiple([execution1, execution2])

		expect(results.get(execution1)).toEqual([event1])
		expect(results.get(execution2)).toEqual([event2])
	})

	it('should return empty array for non-existent execution', async () => {
		const events = await adapter.retrieve('non-existent')
		expect(events).toEqual([])
	})

	it('should maintain event order', async () => {
		const executionId = 'test-execution-order'
		const events: FlowcraftEvent[] = [
			{ type: 'workflow:start', payload: { blueprintId: 'test', executionId } },
			{ type: 'node:start', payload: { nodeId: 'node1', executionId, input: null, blueprintId: 'test' } },
			{
				type: 'node:finish',
				payload: { nodeId: 'node1', result: { output: 'done' }, executionId, blueprintId: 'test' },
			},
			{ type: 'workflow:finish', payload: { blueprintId: 'test', executionId, status: 'completed' } },
		]

		for (const event of events) {
			await adapter.store(event, executionId)
		}

		const retrieved = await adapter.retrieve(executionId)
		expect(retrieved).toEqual(events)
	})

	it('should provide statistics', async () => {
		const executionId = 'test-stats'
		const event: FlowcraftEvent = {
			type: 'workflow:start',
			payload: { blueprintId: 'test', executionId },
		}

		await adapter.store(event, executionId)
		const stats = adapter.getStats()

		expect(stats.totalEvents).toBe(1)
		expect(stats.executions).toBe(1)
	})

	it('should clear all events', async () => {
		const executionId = 'test-clear'
		const event: FlowcraftEvent = {
			type: 'workflow:start',
			payload: { blueprintId: 'test', executionId },
		}

		await adapter.store(event, executionId)
		expect(adapter.getStats().totalEvents).toBe(1)

		adapter.clear()
		expect(adapter.getStats().totalEvents).toBe(0)
	})
})

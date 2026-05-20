import { describe, it, expect } from 'vitest'
import {
	getEventProp,
	getCompletedNodes,
	getNodeErrors,
	reconstructContext,
	getExecutionStatus,
	getAwaitingNodesInfo,
	getNodeFinishEvent,
	getNodeErrorEvents,
	getNodeRetryHistory,
} from '../../src/utils/events'

describe('getEventProp', () => {
	it('returns value from top-level key', () => {
		const event = { type: 'node:finish', nodeId: 'abc' }
		expect(getEventProp(event, 'type')).toBe('node:finish')
		expect(getEventProp(event, 'nodeId')).toBe('abc')
	})

	it('returns undefined for missing key', () => {
		const event = { type: 'node:finish' }
		expect(getEventProp(event, 'nonexistent')).toBeUndefined()
	})

	it('falls back to payload without warning', () => {
		const event = { type: 'node:finish', payload: { nodeId: 'abc' } }
		expect(getEventProp(event, 'nodeId')).toBe('abc')
	})

	it('handles non-object input', () => {
		expect(getEventProp(null, 'key')).toBeUndefined()
		expect(getEventProp(undefined, 'key')).toBeUndefined()
		expect(getEventProp(42, 'key')).toBeUndefined()
	})
})

describe('getCompletedNodes', () => {
	it('returns empty array for no events', () => {
		expect(getCompletedNodes([])).toEqual([])
	})

	it('extracts node IDs from node:finish events', () => {
		const events = [
			{ type: 'node:finish', nodeId: 'a' },
			{ type: 'node:finish', nodeId: 'b' },
			{ type: 'node:start', nodeId: 'c' },
		]
		expect(getCompletedNodes(events)).toEqual(['a', 'b'])
	})

	it('deduplicates node IDs', () => {
		const events = [
			{ type: 'node:finish', nodeId: 'a' },
			{ type: 'node:finish', nodeId: 'a' },
		]
		expect(getCompletedNodes(events)).toEqual(['a'])
	})

	it('handles events with payload', () => {
		const events = [{ type: 'node:finish', payload: { nodeId: 'a' } }]
		expect(getCompletedNodes(events)).toEqual(['a'])
	})
})

describe('getNodeErrors', () => {
	it('returns empty array for no errors', () => {
		const events = [{ type: 'node:finish', nodeId: 'a' }]
		expect(getNodeErrors(events)).toEqual([])
	})

	it('extracts error details from node:error events', () => {
		const events = [
			{ type: 'node:error', nodeId: 'a', error: { message: 'timeout', isFatal: true } },
		]
		expect(getNodeErrors(events)).toEqual([
			{
				nodeId: 'a',
				message: 'timeout',
				isFatal: true,
			},
		])
	})

	it('handles missing error message', () => {
		const events = [{ type: 'node:error', nodeId: 'a' }]
		const result = getNodeErrors(events)
		expect(result[0].message).toBe('Unknown error')
	})
})

describe('reconstructContext', () => {
	it('rebuilds context from context:change events', () => {
		const events = [
			{ type: 'context:change', key: 'a', value: 1 },
			{ type: 'context:change', key: 'b', value: 'hello' },
		]
		expect(reconstructContext(events)).toEqual({ a: 1, b: 'hello' })
	})

	it('handles delete operations', () => {
		const events = [
			{ type: 'context:change', key: 'a', value: 1 },
			{ type: 'context:change', key: 'a', op: 'delete' },
		]
		expect(reconstructContext(events)).toEqual({})
	})

	it('overwrites previous values for same key', () => {
		const events = [
			{ type: 'context:change', key: 'a', value: 1 },
			{ type: 'context:change', key: 'a', value: 2 },
		]
		expect(reconstructContext(events)).toEqual({ a: 2 })
	})

	it('handles nested dot-notation keys', () => {
		const events = [
			{ type: 'context:change', key: 'user.name', value: 'Alice' },
			{ type: 'context:change', key: 'user.age', value: 30 },
		]
		const result = reconstructContext(events)
		expect((result as Record<string, Record<string, unknown>>).user.name).toBe('Alice')
		expect((result as Record<string, Record<string, unknown>>).user.age).toBe(30)
	})

	it('handles nested delete', () => {
		const events = [
			{ type: 'context:change', key: 'user.name', value: 'Alice' },
			{ type: 'context:change', key: 'user.name', op: 'delete' },
		]
		const result = reconstructContext(events)
		expect((result as Record<string, Record<string, unknown>>).user).toEqual({})
	})
})

describe('getExecutionStatus', () => {
	it('returns unknown for empty events', () => {
		expect(getExecutionStatus([])).toEqual({ status: 'unknown' })
	})

	it('returns started for workflow:start only', () => {
		const events = [{ type: 'workflow:start', blueprintId: 'bp1' }]
		expect(getExecutionStatus(events)).toEqual({ status: 'started', blueprintId: 'bp1' })
	})

	it('returns completed for workflow:finish', () => {
		const events = [
			{ type: 'workflow:start' },
			{ type: 'workflow:finish', status: 'completed' },
		]
		expect(getExecutionStatus(events).status).toBe('completed')
	})

	it('returns failed for workflow:stall', () => {
		const events = [{ type: 'workflow:start' }, { type: 'workflow:stall' }]
		expect(getExecutionStatus(events).status).toBe('failed')
	})

	it('returns awaiting for workflow:pause', () => {
		const events = [{ type: 'workflow:start' }, { type: 'workflow:pause' }]
		expect(getExecutionStatus(events).status).toBe('awaiting')
	})
})

describe('getAwaitingNodesInfo', () => {
	it('returns empty array when no awaiting nodes', () => {
		const events = [{ type: 'context:change', key: 'a', value: 1 }]
		expect(getAwaitingNodesInfo(events)).toEqual([])
	})

	it('extracts awaiting nodes from context', () => {
		const events = [
			{ type: 'context:change', key: '_awaitingNodeIds', value: ['node1', 'node2'] },
			{
				type: 'context:change',
				key: '_awaitingDetails',
				value: { node1: { reason: 'timer' }, node2: { reason: 'human_input' } },
			},
		]
		const result = getAwaitingNodesInfo(events)
		expect(result).toHaveLength(2)
		expect(result[0].nodeId).toBe('node1')
		expect(result[0].details).toEqual({ reason: 'timer' })
	})
})

describe('getNodeFinishEvent', () => {
	it('returns undefined for non-existent node', () => {
		const events = [{ type: 'node:finish', nodeId: 'a' }]
		expect(getNodeFinishEvent(events, 'b')).toBeUndefined()
	})

	it('returns the finish event for a node', () => {
		const events = [{ type: 'node:finish', nodeId: 'a', result: { output: 'done' } }]
		const event = getNodeFinishEvent(events, 'a')
		expect(event).toBeDefined()
		expect((event as Record<string, unknown>).nodeId).toBe('a')
	})
})

describe('getNodeErrorEvents', () => {
	it('returns empty array for node with no errors', () => {
		const events = [{ type: 'node:finish', nodeId: 'a' }]
		expect(getNodeErrorEvents(events, 'a')).toEqual([])
	})

	it('returns all error events for a node', () => {
		const events = [
			{ type: 'node:error', nodeId: 'a' },
			{ type: 'node:error', nodeId: 'a' },
			{ type: 'node:error', nodeId: 'b' },
		]
		expect(getNodeErrorEvents(events, 'a')).toHaveLength(2)
	})
})

describe('getNodeRetryHistory', () => {
	it('returns empty array for no retries', () => {
		const events = [{ type: 'node:finish', nodeId: 'a' }]
		expect(getNodeRetryHistory(events, 'a')).toEqual([])
	})

	it('returns retry attempts', () => {
		const events = [
			{ type: 'node:retry', nodeId: 'a', attempt: 1 },
			{ type: 'node:retry', nodeId: 'a', attempt: 2 },
		]
		const history = getNodeRetryHistory(events, 'a')
		expect(history).toHaveLength(2)
		expect(history[0].attempt).toBe(1)
		expect(history[1].attempt).toBe(2)
	})
})

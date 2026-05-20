import { describe, it, expect } from 'vitest'
import { createGetExecutionContextTool } from '../../src/orchestrate/get-context'
import { createGetAwaitingNodesTool } from '../../src/orchestrate/get-awaiting'
import { createGetExecutionTimelineTool } from '../../src/orchestrate/get-timeline'
import { createGetExecutionMetricsTool } from '../../src/orchestrate/get-metrics'
import { createGetErrorDiagnosisTool } from '../../src/orchestrate/get-diagnosis'
import { createWatchExecutionTool } from '../../src/orchestrate/watch'
import type { EventStore } from '../../src/types'

function makeEventStore(events: unknown[]): EventStore {
	return {
		store: async () => {},
		retrieve: async () => events,
		retrieveMultiple: async () => new Map(),
	}
}

const completedExecution = [
	{ type: 'workflow:start', blueprintId: 'test-bp', timestamp: 1000 },
	{ type: 'node:start', nodeId: 'a', timestamp: 1001 },
	{ type: 'node:finish', nodeId: 'a', result: { output: { x: 1 } }, timestamp: 1010 },
	{ type: 'context:change', key: '_outputs', value: { a: { x: 1 } }, timestamp: 1011 },
	{ type: 'node:start', nodeId: 'b', timestamp: 1012 },
	{ type: 'node:finish', nodeId: 'b', result: { output: { y: 2 } }, timestamp: 1020 },
	{ type: 'workflow:finish', status: 'completed', timestamp: 1021 },
]

const failedExecution = [
	{ type: 'workflow:start', blueprintId: 'test-bp', timestamp: 2000 },
	{ type: 'node:start', nodeId: 'a', timestamp: 2001 },
	{
		type: 'node:error',
		nodeId: 'a',
		error: { message: 'connection refused', isFatal: true },
		timestamp: 2005,
	},
	{ type: 'node:retry', nodeId: 'a', attempt: 1, timestamp: 2006 },
	{
		type: 'node:error',
		nodeId: 'a',
		error: { message: 'connection refused', isFatal: true },
		timestamp: 2010,
	},
	{ type: 'workflow:finish', status: 'failed', timestamp: 2011 },
]

const awaitingExecution = [
	{ type: 'workflow:start', blueprintId: 'test-bp', timestamp: 3000 },
	{ type: 'node:finish', nodeId: 'a', result: { output: {} }, timestamp: 3010 },
	{ type: 'context:change', key: '_awaitingNodeIds', value: ['wait_node'], timestamp: 3011 },
	{
		type: 'context:change',
		key: '_awaitingDetails',
		value: { wait_node: { reason: 'timer', wakeUpAt: '2024-01-01T00:00:00Z' } },
		timestamp: 3012,
	},
	{ type: 'workflow:pause', timestamp: 3013 },
]

describe('createGetExecutionContextTool', () => {
	it('reconstructs context from events', async () => {
		const tool = createGetExecutionContextTool({
			eventStore: makeEventStore(completedExecution),
		})
		const result = await tool.execute({ executionId: 'exec1' })
		expect(result.status).toBe('completed')
		expect(result.data.context).toBeDefined()
	})

	it('includes change history when requested', async () => {
		const tool = createGetExecutionContextTool({
			eventStore: makeEventStore(completedExecution),
		})
		const result = await tool.execute({ executionId: 'exec1', includeHistory: true })
		expect(result.data.changeHistory).toBeDefined()
		expect(result.data.changeHistory.length).toBeGreaterThan(0)
	})

	it('fails for empty events', async () => {
		const tool = createGetExecutionContextTool({ eventStore: makeEventStore([]) })
		const result = await tool.execute({ executionId: 'empty' })
		expect(result.status).toBe('failed')
	})
})

describe('createGetAwaitingNodesTool', () => {
	it('detects awaiting nodes', async () => {
		const tool = createGetAwaitingNodesTool({ eventStore: makeEventStore(awaitingExecution) })
		const result = await tool.execute({ executionId: 'awaiting' })
		expect(result.data.awaiting).toBe(true)
		expect(result.data.awaitingNodeIds).toContain('wait_node')
	})

	it('categorizes await reason as timer', async () => {
		const tool = createGetAwaitingNodesTool({ eventStore: makeEventStore(awaitingExecution) })
		const result = await tool.execute({ executionId: 'awaiting' })
		const details = result.data.details.find((d) => d.nodeId === 'wait_node')
		expect(details?.reason).toBe('timer')
	})

	it('returns no awaiting nodes for completed execution', async () => {
		const tool = createGetAwaitingNodesTool({ eventStore: makeEventStore(completedExecution) })
		const result = await tool.execute({ executionId: 'completed' })
		expect(result.data.awaiting).toBe(false)
	})
})

describe('createGetExecutionTimelineTool', () => {
	it('builds timeline with node statuses', async () => {
		const tool = createGetExecutionTimelineTool({
			eventStore: makeEventStore(completedExecution),
		})
		const result = await tool.execute({ executionId: 'timeline' })
		expect(result.data.nodes).toHaveLength(2)
		const nodeA = result.data.nodes.find((n) => n.nodeId === 'a')
		expect(nodeA?.status).toBe('completed')
		expect(nodeA?.duration).toBe(9)
	})

	it('shows failed status for errored nodes', async () => {
		const tool = createGetExecutionTimelineTool({ eventStore: makeEventStore(failedExecution) })
		const result = await tool.execute({ executionId: 'failed' })
		const nodeA = result.data.nodes.find((n) => n.nodeId === 'a')
		expect(nodeA?.status).toBe('failed')
		expect(nodeA?.error).toBe('connection refused')
	})
})

describe('createGetExecutionMetricsTool', () => {
	it('calculates metrics from events', async () => {
		const tool = createGetExecutionMetricsTool({
			eventStore: makeEventStore(completedExecution),
		})
		const result = await tool.execute({ executionId: 'metrics' })
		expect(result.data.nodesCompleted).toBe(2)
		expect(result.data.errorCount).toBe(0)
	})

	it('uses event timestamps for duration', async () => {
		const tool = createGetExecutionMetricsTool({
			eventStore: makeEventStore(completedExecution),
		})
		const result = await tool.execute({ executionId: 'metrics' })
		expect(result.data.duration).toBe(21)
	})

	it('counts retries', async () => {
		const tool = createGetExecutionMetricsTool({ eventStore: makeEventStore(failedExecution) })
		const result = await tool.execute({ executionId: 'failed' })
		expect(result.data.retryCount).toBe(1)
	})
})

describe('createGetErrorDiagnosisTool', () => {
	it('classifies single node failure', async () => {
		const tool = createGetErrorDiagnosisTool({ eventStore: makeEventStore(failedExecution) })
		const result = await tool.execute({ executionId: 'diag' })
		expect(result.data.errorPattern).toBe('single_node_failed')
		expect(result.data.nodesWithErrors).toHaveLength(1)
	})

	it('reports no errors for successful execution', async () => {
		const tool = createGetErrorDiagnosisTool({ eventStore: makeEventStore(completedExecution) })
		const result = await tool.execute({ executionId: 'diag' })
		expect(result.data.hasErrors).toBe(false)
		expect(result.data.errorPattern).toBe('no_errors')
	})
})

describe('createWatchExecutionTool', () => {
	it('respects maxPolls limit', async () => {
		const store = makeEventStore([{ type: 'workflow:start', blueprintId: 'test-bp' }])
		const tool = createWatchExecutionTool({ eventStore: store })
		const result = await tool.execute({ executionId: 'watch', maxPolls: 1, interval: 10 })
		expect(result.data.pollsCompleted).toBe(1)
	})

	it('respects timeout option', async () => {
		const store = makeEventStore([{ type: 'workflow:start', blueprintId: 'test-bp' }])
		const tool = createWatchExecutionTool({ eventStore: store })
		const result = await tool.execute({
			executionId: 'watch',
			maxPolls: 100,
			interval: 50,
			timeout: 10,
		})
		expect(result.data.timeline.some((e) => e.eventType === 'watch_timeout')).toBe(true)
	})

	it('stops on completed execution', async () => {
		let callCount = 0
		const store: EventStore = {
			store: async () => {},
			retrieve: async () => {
				callCount++
				if (callCount > 1) return completedExecution
				return [{ type: 'workflow:start', blueprintId: 'test-bp' }]
			},
			retrieveMultiple: async () => new Map(),
		}
		const tool = createWatchExecutionTool({ eventStore: store })
		const result = await tool.execute({ executionId: 'watch', maxPolls: 10, interval: 10 })
		expect(result.data.status).toBe('completed')
	})
})

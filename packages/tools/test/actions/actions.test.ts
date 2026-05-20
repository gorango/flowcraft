import { describe, it, expect } from 'vitest'
import { createGetNodeInfoTool } from '../../src/actions/node-info'
import { createGetNodeOutputTool } from '../../src/actions/get-output'
import { createGetNodeErrorTool } from '../../src/actions/get-error'
import type { BlueprintResolver, EventStore } from '../../src/types'

const mockResolver: BlueprintResolver = {
	resolve: async () => ({
		blueprint: {
			id: 'test-bp',
			nodes: [
				{ id: 'a', uses: 'mock_node', params: { x: 1 }, config: { timeout: 5000 } },
				{ id: 'b', uses: 'wait' },
			],
			edges: [{ source: 'a', target: 'b', action: 'next' }],
			metadata: { version: '1.0' },
		},
		version: '1.0',
	}),
}

const mockEventStore: EventStore = {
	store: async () => {},
	retrieve: async (id) => {
		if (id === 'exec-with-output') {
			return [
				{ type: 'workflow:start', blueprintId: 'test-bp' },
				{ type: 'node:finish', nodeId: 'a', result: { output: { data: 'hello' } } },
			]
		}
		if (id === 'exec-with-error') {
			return [
				{ type: 'workflow:start', blueprintId: 'test-bp' },
				{ type: 'node:error', nodeId: 'a', error: { message: 'timeout', isFatal: false } },
				{ type: 'node:retry', nodeId: 'a', attempt: 1 },
			]
		}
		if (id === 'exec-empty') return []
		return []
	},
	retrieveMultiple: async () => new Map(),
}

describe('createGetNodeInfoTool', () => {
	it('returns node definition with edges', async () => {
		const tool = createGetNodeInfoTool({ resolver: mockResolver })
		const result = await tool.execute({ workflowId: 'test-bp', nodeId: 'a' })
		expect(result.status).toBe('completed')
		expect(result.data.id).toBe('a')
		expect(result.data.uses).toBe('mock_node')
		expect(result.data.incomingEdges).toEqual([])
		expect(result.data.outgoingEdges).toEqual([{ target: 'b', action: 'next' }])
	})

	it('identifies internal nodes', async () => {
		const tool = createGetNodeInfoTool({ resolver: mockResolver })
		const result = await tool.execute({ workflowId: 'test-bp', nodeId: 'b' })
		expect(result.data.isInternal).toBe(true)
	})

	it('fails for non-existent node', async () => {
		const tool = createGetNodeInfoTool({ resolver: mockResolver })
		const result = await tool.execute({ workflowId: 'test-bp', nodeId: 'nonexistent' })
		expect(result.status).toBe('failed')
		expect(result.error?.code).toBe('NODE_NOT_FOUND')
	})
})

describe('createGetNodeOutputTool', () => {
	it('returns node output from finish event', async () => {
		const tool = createGetNodeOutputTool({ eventStore: mockEventStore })
		const result = await tool.execute({ executionId: 'exec-with-output', nodeId: 'a' })
		expect(result.status).toBe('completed')
		expect(result.data.output).toEqual({ data: 'hello' })
		expect(result.data.hasOutput).toBe(true)
	})

	it('fails for non-existent execution', async () => {
		const tool = createGetNodeOutputTool({ eventStore: mockEventStore })
		const result = await tool.execute({ executionId: 'exec-empty', nodeId: 'a' })
		expect(result.status).toBe('failed')
		expect(result.error?.code).toBe('EXECUTION_NOT_FOUND')
	})

	it('fails for node not yet executed', async () => {
		const tool = createGetNodeOutputTool({ eventStore: mockEventStore })
		const result = await tool.execute({ executionId: 'exec-with-output', nodeId: 'b' })
		expect(result.status).toBe('failed')
		expect(result.error?.code).toBe('NODE_NOT_EXECUTED')
	})

	it('fails for failed node', async () => {
		const tool = createGetNodeOutputTool({ eventStore: mockEventStore })
		const result = await tool.execute({ executionId: 'exec-with-error', nodeId: 'a' })
		expect(result.status).toBe('failed')
	})
})

describe('createGetNodeErrorTool', () => {
	it('returns error details', async () => {
		const tool = createGetNodeErrorTool({ eventStore: mockEventStore })
		const result = await tool.execute({ executionId: 'exec-with-error', nodeId: 'a' })
		expect(result.status).toBe('completed')
		expect(result.data.hasError).toBe(true)
		expect(result.data.error.message).toBe('timeout')
		expect(result.data.retryCount).toBe(1)
	})

	it('returns no error for successful node', async () => {
		const tool = createGetNodeErrorTool({ eventStore: mockEventStore })
		const result = await tool.execute({ executionId: 'exec-with-output', nodeId: 'a' })
		expect(result.data.hasError).toBe(false)
	})
})

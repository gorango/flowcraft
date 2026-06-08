import { describe, it, expect } from 'vitest'
import { createListWorkflowsTool } from '../../src/discover/list-workflows'
import { createGetWorkflowTool } from '../../src/discover/get-workflow'
import { createListExecutionsTool } from '../../src/discover/list-executions'
import { createGetExecutionTool } from '../../src/discover/get-execution'
import type { BlueprintDatabase, BlueprintResolver, EventStore } from '../../src/types'

const mockDatabase: BlueprintDatabase = {
	find: async ({ id, version }) => {
		if (id === 'test-bp') {
			return {
				blueprint: {
					id: 'test-bp',
					nodes: [
						{ id: 'a', uses: 'mock_node' },
						{ id: 'b', uses: 'wait' },
					],
					edges: [{ source: 'a', target: 'b' }],
					metadata: { version: version ?? '1.0' },
				},
				version: version ?? '1.0',
			}
		}
		throw new Error(`Blueprint not found: ${id}`)
	},
	list: async ({ limit = 50, offset = 0 } = {}) => {
		const all = [
			{ id: 'bp-1', version: '1.0', metadata: { name: 'Workflow One' } },
			{ id: 'bp-2', version: '1.0', metadata: { name: 'Workflow Two' } },
			{ id: 'bp-3', version: '2.0', metadata: { name: 'Workflow Three' } },
		]
		return all.slice(offset, offset + limit)
	},
}

const mockResolver: BlueprintResolver = {
	resolve: async ({ id }) => {
		if (id === 'test-bp') {
			return {
				blueprint: {
					id: 'test-bp',
					nodes: [{ id: 'step1', uses: 'mock' }],
					edges: [],
					metadata: { version: '1.0' },
				},
				version: '1.0',
			}
		}
		throw new Error(`Blueprint not found: ${id}`)
	},
}

const mockEventStore: EventStore = {
	store: async () => {},
	retrieve: async (id) => {
		if (id === 'exec-1') {
			return [
				{ type: 'workflow:start', blueprintId: 'test-bp' },
				{ type: 'node:finish', nodeId: 'a', result: { output: { x: 1 } } },
				{ type: 'workflow:finish', status: 'completed' },
			]
		}
		if (id === 'exec-empty') return []
		return []
	},
	retrieveMultiple: async () => new Map(),
}

describe('createListWorkflowsTool', () => {
	it('lists workflows from database resolver', async () => {
		const tool = createListWorkflowsTool({ resolver: mockDatabase })
		const result = await tool.execute({})
		expect(result.status).toBe('completed')
		expect(result.data.workflows).toHaveLength(3)
	})

	it('respects limit parameter', async () => {
		const tool = createListWorkflowsTool({ resolver: mockDatabase })
		const result = await tool.execute({ limit: 1 })
		expect(result.data.workflows).toHaveLength(1)
	})

	it('returns empty for non-database resolver', async () => {
		const tool = createListWorkflowsTool({ resolver: mockResolver })
		const result = await tool.execute({})
		expect(result.status).toBe('completed')
		expect(result.data.workflows).toEqual([])
	})
})

describe('createGetWorkflowTool', () => {
	it('returns workflow summary', async () => {
		const tool = createGetWorkflowTool({ resolver: mockResolver })
		const result = await tool.execute({ workflowId: 'test-bp' })
		expect(result.status).toBe('completed')
		expect(result.data.id).toBe('test-bp')
		expect(result.data.nodeCount).toBe(1)
		expect(result.data.edgeCount).toBe(0)
	})

	it('includes blueprint when requested', async () => {
		const tool = createGetWorkflowTool({ resolver: mockResolver })
		const result = await tool.execute({ workflowId: 'test-bp', includeBlueprint: true })
		expect(result.data.blueprint).toBeDefined()
		expect(result.data.blueprint.id).toBe('test-bp')
	})

	it('fails for unknown workflow', async () => {
		const tool = createGetWorkflowTool({ resolver: mockResolver })
		const result = await tool.execute({ workflowId: 'nonexistent' })
		expect(result.status).toBe('failed')
	})
})

describe('createListExecutionsTool', () => {
	const executionIndex = new Map([
		[
			'exec-1',
			{
				executionId: 'exec-1',
				blueprintId: 'bp-a',
				status: 'completed',
				startedAt: 1000,
			},
		],
		[
			'exec-2',
			{
				executionId: 'exec-2',
				blueprintId: 'bp-b',
				status: 'failed',
				startedAt: 2000,
			},
		],
	])

	it('lists executions from index', async () => {
		const tool = createListExecutionsTool({ eventStore: mockEventStore, executionIndex })
		const result = await tool.execute({})
		expect(result.status).toBe('completed')
		expect(result.data.executions).toHaveLength(2)
	})

	it('filters by blueprintId', async () => {
		const tool = createListExecutionsTool({ eventStore: mockEventStore, executionIndex })
		const result = await tool.execute({ blueprintId: 'bp-a' })
		expect(result.data.executions).toHaveLength(1)
		expect(result.data.executions[0].blueprintId).toBe('bp-a')
	})

	it('respects limit', async () => {
		const tool = createListExecutionsTool({ eventStore: mockEventStore, executionIndex })
		const result = await tool.execute({ limit: 1 })
		expect(result.data.executions).toHaveLength(1)
	})

	it('returns note without index', async () => {
		const tool = createListExecutionsTool({ eventStore: mockEventStore })
		const result = await tool.execute({})
		expect(result.data.note).toBeDefined()
	})
})

describe('createGetExecutionTool', () => {
	it('returns execution details', async () => {
		const tool = createGetExecutionTool({ eventStore: mockEventStore })
		const result = await tool.execute({ executionId: 'exec-1' })
		expect(result.status).toBe('completed')
		expect(result.data.blueprintId).toBe('test-bp')
		expect(result.data.nodesCompleted).toContain('a')
	})

	it('fails for empty events', async () => {
		const tool = createGetExecutionTool({ eventStore: mockEventStore })
		const result = await tool.execute({ executionId: 'exec-empty' })
		expect(result.status).toBe('failed')
	})
})

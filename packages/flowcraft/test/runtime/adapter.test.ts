import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FlowcraftError } from '../../src/errors'
import type { AdapterOptions, ICoordinationStore, JobPayload } from '../../src/runtime'
import { BaseDistributedAdapter, FlowRuntime } from '../../src/runtime'
import type { IAsyncContext, NodeDefinition, WorkflowBlueprint } from '../../src/types'

const mockRuntime = {
	executeNode: vi.fn(),
	determineNextNodes: vi.fn(),
	applyEdgeTransform: vi.fn(),
	options: { blueprints: {} as Record<string, any> },
}

vi.mock('../../src/runtime/runtime.ts', () => ({
	FlowRuntime: vi.fn().mockImplementation(() => mockRuntime),
}))

class MockAdapter extends BaseDistributedAdapter {
	createContext = vi.fn()
	processJobs = vi.fn()
	enqueueJob = vi.fn()
	publishFinalResult = vi.fn()
}

describe('BaseDistributedAdapter', () => {
	let mockCoordinationStore: ICoordinationStore
	let mockRuntime: FlowRuntime<any, any>
	let mockContext: IAsyncContext<Record<string, any>>
	let adapter: MockAdapter
	let jobHandler: (job: JobPayload) => Promise<void>

	const linearBlueprint: WorkflowBlueprint = {
		id: 'linear',
		nodes: [
			{ id: 'A', uses: 'test' },
			{ id: 'B', uses: 'output' },
		],
		edges: [{ source: 'A', target: 'B' }],
	}

	const fanInBlueprint: WorkflowBlueprint = {
		id: 'fan-in',
		nodes: [
			{ id: 'A', uses: 'test' },
			{ id: 'B', uses: 'test' },
			{ id: 'C', uses: 'output' },
		],
		edges: [
			{ source: 'A', target: 'C' },
			{ source: 'B', target: 'C' },
		],
	}

	const fanInAnyBlueprint: WorkflowBlueprint = {
		id: 'fan-in-any',
		nodes: [
			{ id: 'A', uses: 'test' },
			{ id: 'B', uses: 'test' },
			{ id: 'C', uses: 'output', config: { joinStrategy: 'any' } },
		],
		edges: [
			{ source: 'A', target: 'C' },
			{ source: 'B', target: 'C' },
		],
	}

	const blueprints = {
		linear: linearBlueprint,
		'fan-in': fanInBlueprint,
		'fan-in-any': fanInAnyBlueprint,
	}

	beforeEach(() => {
		mockCoordinationStore = {
			increment: vi.fn(),
			setIfNotExist: vi.fn().mockResolvedValue(true), // Default to allowing locks
			delete: vi.fn(),
			get: vi.fn().mockResolvedValue(undefined),
		}

		mockRuntime = {
			executeNode: vi.fn(),
			determineNextNodes: vi.fn(),
			applyEdgeTransform: vi.fn(),
			options: { blueprints },
		} as any

		mockContext = {
			get: vi.fn(),
			set: vi.fn(),
			has: vi.fn(),
			delete: vi.fn(),
			toJSON: vi.fn().mockResolvedValue({}),
			type: 'async',
		}

		vi.mocked(FlowRuntime).mockImplementation(() => mockRuntime)

		const adapterOptions: AdapterOptions = {
			runtimeOptions: { blueprints },
			coordinationStore: mockCoordinationStore,
		}

		adapter = new MockAdapter(adapterOptions)
		adapter.createContext.mockReturnValue(mockContext)

		adapter.start()
		jobHandler = adapter.processJobs.mock.calls[0][0]
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('Core Orchestration', () => {
		it('should execute a node and enqueue the next one in a linear flow', async () => {
			const job: JobPayload = {
				runId: 'run1',
				blueprintId: 'linear',
				nodeId: 'A',
			}
			const nodeB: NodeDefinition = { id: 'B', uses: 'output' }
			const edgeAB = { source: 'A', target: 'B' }

			vi.mocked(mockRuntime.executeNode).mockResolvedValue({
				output: 'Result from A',
			})
			vi.mocked(mockRuntime.determineNextNodes).mockResolvedValue([{ node: nodeB, edge: edgeAB }])

			await jobHandler(job)

			expect(mockRuntime.executeNode).toHaveBeenCalledWith(linearBlueprint, 'A', expect.any(Object))
			expect(mockContext.set).toHaveBeenCalledWith('_outputs.A', 'Result from A')
			expect(adapter.enqueueJob).toHaveBeenCalledWith({
				runId: 'run1',
				blueprintId: 'linear',
				nodeId: 'B',
			})
			expect(adapter.publishFinalResult).not.toHaveBeenCalled()
		})

		it('should publish a "completed" result when all terminal nodes finish', async () => {
			const job: JobPayload = {
				runId: 'run1',
				blueprintId: 'linear',
				nodeId: 'B',
			}

			vi.mocked(mockRuntime.executeNode).mockResolvedValue({
				output: 'Final Result',
			})
			vi.mocked(mockRuntime.determineNextNodes).mockResolvedValue([]) // No more nodes
			vi.mocked(mockContext.toJSON).mockResolvedValue({ '_outputs.B': 'Final Result' })

			await jobHandler(job)

			expect(mockRuntime.executeNode).toHaveBeenCalledWith(linearBlueprint, 'B', expect.any(Object))
			expect(mockContext.set).toHaveBeenCalledWith('_outputs.B', 'Final Result')
			expect(adapter.enqueueJob).not.toHaveBeenCalled()
			expect(adapter.publishFinalResult).toHaveBeenCalledWith(
				'run1',
				expect.objectContaining({
					status: 'completed',
					payload: expect.objectContaining({ status: 'completed' }),
				}),
			)
		})

		it('should complete the workflow when a terminal node finishes, even if not an output node', async () => {
			const terminalNonOutputBlueprint: WorkflowBlueprint = {
				id: 't',
				nodes: [{ id: 'A', uses: 'test' }],
				edges: [],
			}
			if (mockRuntime.options.blueprints) {
				vi.mocked(mockRuntime.options.blueprints).t = terminalNonOutputBlueprint
			}
			const job: JobPayload = { runId: 'run1', blueprintId: 't', nodeId: 'A' }

			vi.mocked(mockRuntime.executeNode).mockResolvedValue({
				output: 'end of branch',
			})
			vi.mocked(mockRuntime.determineNextNodes).mockResolvedValue([])
			vi.mocked(mockContext.toJSON).mockResolvedValue({ '_outputs.A': 'end of branch' })

			await jobHandler(job)

			expect(mockContext.set).toHaveBeenCalledWith('_outputs.A', 'end of branch')
			expect(adapter.enqueueJob).not.toHaveBeenCalled()
			expect(adapter.publishFinalResult).toHaveBeenCalledWith(
				'run1',
				expect.objectContaining({
					status: 'completed',
					payload: expect.objectContaining({ status: 'completed' }),
				}),
			)
		})

		it('should not complete the workflow until all terminal nodes finish', async () => {
			const multipleTerminalBlueprint: WorkflowBlueprint = {
				id: 'multi-terminal',
				nodes: [
					{ id: 'A', uses: 'test' },
					{ id: 'B', uses: 'test' },
					{ id: 'C', uses: 'test' },
				],
				edges: [
					{ source: 'A', target: 'B' },
					{ source: 'A', target: 'C' },
				],
			}
			if (mockRuntime.options.blueprints) {
				vi.mocked(mockRuntime.options.blueprints)['multi-terminal'] = multipleTerminalBlueprint
			}
			const job: JobPayload = { runId: 'run1', blueprintId: 'multi-terminal', nodeId: 'B' }

			vi.mocked(mockRuntime.executeNode).mockResolvedValue({
				output: 'result from B',
			})
			vi.mocked(mockRuntime.determineNextNodes).mockResolvedValue([])

			await jobHandler(job)

			expect(adapter.enqueueJob).not.toHaveBeenCalled()
			expect(adapter.publishFinalResult).not.toHaveBeenCalled()
		})
	})

	describe('Fan-In Join Logic', () => {
		it('should wait for all predecessors with "all" join strategy', async () => {
			const job: JobPayload = {
				runId: 'run1',
				blueprintId: 'fan-in',
				nodeId: 'A',
			}
			vi.mocked(mockRuntime.executeNode).mockResolvedValue({ output: 'from A' })
			vi.mocked(mockRuntime.determineNextNodes).mockResolvedValue([
				{ node: fanInBlueprint.nodes[2], edge: fanInBlueprint.edges[0] },
			])
			// First predecessor arrives, counter is now 1
			vi.mocked(mockCoordinationStore.increment).mockResolvedValue(1)

			await jobHandler(job)

			expect(mockCoordinationStore.increment).toHaveBeenCalledWith('flowcraft:fanin:run1:C', 3600)
			expect(adapter.enqueueJob).not.toHaveBeenCalled()
		})

		it('should enqueue the job when the last predecessor arrives with "all" join strategy', async () => {
			const job: JobPayload = {
				runId: 'run1',
				blueprintId: 'fan-in',
				nodeId: 'B',
			}
			vi.mocked(mockRuntime.executeNode).mockResolvedValue({ output: 'from B' })
			vi.mocked(mockRuntime.determineNextNodes).mockResolvedValue([
				{ node: fanInBlueprint.nodes[2], edge: fanInBlueprint.edges[1] },
			])
			// Second predecessor arrives, counter is now 2 (which matches predecessor count)
			vi.mocked(mockCoordinationStore.increment).mockResolvedValue(2)

			await jobHandler(job)

			expect(mockCoordinationStore.increment).toHaveBeenCalledWith('flowcraft:fanin:run1:C', 3600)
			expect(mockCoordinationStore.delete).toHaveBeenCalledWith('flowcraft:fanin:run1:C')
			expect(adapter.enqueueJob).toHaveBeenCalledWith({
				runId: 'run1',
				blueprintId: 'fan-in',
				nodeId: 'C',
			})
		})

		it('should enqueue the job only for the first predecessor with "any" join strategy', async () => {
			const job: JobPayload = {
				runId: 'run1',
				blueprintId: 'fan-in-any',
				nodeId: 'A',
			}
			vi.mocked(mockRuntime.executeNode).mockResolvedValue({ output: 'from A' })
			vi.mocked(mockRuntime.determineNextNodes).mockResolvedValue([
				{ node: fanInAnyBlueprint.nodes[2], edge: fanInAnyBlueprint.edges[0] },
			])
			// First predecessor successfully acquires the lock
			vi.mocked(mockCoordinationStore.setIfNotExist).mockResolvedValue(true)

			await jobHandler(job)

			expect(mockCoordinationStore.setIfNotExist).toHaveBeenCalledWith('flowcraft:joinlock:run1:C', 'locked', 3600)
			expect(adapter.enqueueJob).toHaveBeenCalledWith({
				runId: 'run1',
				blueprintId: 'fan-in-any',
				nodeId: 'C',
			})
		})

		it('should not enqueue the job for subsequent predecessors with "any" join strategy', async () => {
			const job: JobPayload = {
				runId: 'run2',
				blueprintId: 'fan-in-any',
				nodeId: 'B',
			}
			vi.mocked(mockRuntime.executeNode).mockResolvedValue({ output: 'from B' })
			vi.mocked(mockRuntime.determineNextNodes).mockResolvedValue([
				{ node: fanInAnyBlueprint.nodes[2], edge: fanInAnyBlueprint.edges[1] },
			])
			// Poison check is not set, but join lock is already acquired
			vi.mocked(mockCoordinationStore.get).mockResolvedValue(undefined)
			vi.mocked(mockCoordinationStore.setIfNotExist).mockResolvedValue(false) // Join lock fails

			await jobHandler(job)

			const joinLockKey = 'flowcraft:joinlock:run2:C'
			expect(mockCoordinationStore.setIfNotExist).toHaveBeenCalledWith(joinLockKey, 'locked', 3600)
			expect(adapter.enqueueJob).not.toHaveBeenCalled()
		})

		it('should throw error when trying to enqueue a poisoned node', async () => {
			const poisonedFanInBlueprint: WorkflowBlueprint = {
				id: 'poisoned-fan-in',
				nodes: [
					{ id: 'A', uses: 'test' },
					{ id: 'B', uses: 'test' },
					{ id: 'C', uses: 'output' },
				],
				edges: [
					{ source: 'A', target: 'C' },
					{ source: 'B', target: 'C' },
				],
			}
			if (mockRuntime.options.blueprints) {
				vi.mocked(mockRuntime.options.blueprints)['poisoned-fan-in'] = poisonedFanInBlueprint
			}
			const job: JobPayload = {
				runId: 'run3',
				blueprintId: 'poisoned-fan-in',
				nodeId: 'B',
			}
			vi.mocked(mockRuntime.executeNode).mockResolvedValue({ output: 'from B' })
			vi.mocked(mockRuntime.determineNextNodes).mockResolvedValue([
				{ node: poisonedFanInBlueprint.nodes[2], edge: poisonedFanInBlueprint.edges[1] },
			])

			// Simulate that the poison pill key already exists in the store.
			const poisonKey = 'flowcraft:fanin:poison:run3:C'
			vi.mocked(mockCoordinationStore.get).mockResolvedValue('poisoned')

			await jobHandler(job)

			expect(mockCoordinationStore.get).toHaveBeenCalledWith(poisonKey)
			expect(adapter.publishFinalResult).toHaveBeenCalledWith('run3', {
				status: 'failed',
				reason: "Node 'C' failed due to poisoned predecessor in run 'run3'",
			})
		})
	})

	describe('Error Handling', () => {
		it('should publish a "failed" result on node execution error', async () => {
			const job: JobPayload = {
				runId: 'run1',
				blueprintId: 'linear',
				nodeId: 'A',
			}
			const executionError = new Error('Node failed spectacularly')
			vi.mocked(mockRuntime.executeNode).mockRejectedValue(executionError)

			await jobHandler(job)

			expect(adapter.enqueueJob).not.toHaveBeenCalled()
			expect(adapter.publishFinalResult).toHaveBeenCalledWith('run1', {
				status: 'failed',
				reason: executionError.message,
			})
		})

		it('should publish a "failed" result if the blueprint is not found', async () => {
			const job: JobPayload = {
				runId: 'run1',
				blueprintId: 'non-existent',
				nodeId: 'A',
			}

			await jobHandler(job)

			expect(mockRuntime.executeNode).not.toHaveBeenCalled()
			expect(adapter.publishFinalResult).toHaveBeenCalledWith('run1', {
				status: 'failed',
				reason: "Blueprint with ID 'non-existent' not found in the worker's runtime registry.",
			})
		})

		it('should write poison pill for "all" join successors when a node fails fatally', async () => {
			const fanInWithFailureBlueprint: WorkflowBlueprint = {
				id: 'fan-in-failure',
				nodes: [
					{ id: 'A', uses: 'test' },
					{ id: 'B', uses: 'test' },
					{ id: 'C', uses: 'output' }, // 'all' join by default
				],
				edges: [
					{ source: 'A', target: 'C' },
					{ source: 'B', target: 'C' },
				],
			}
			if (mockRuntime.options.blueprints) {
				vi.mocked(mockRuntime.options.blueprints)['fan-in-failure'] = fanInWithFailureBlueprint
			}
			const job: JobPayload = {
				runId: 'run1',
				blueprintId: 'fan-in-failure',
				nodeId: 'A',
			}
			const executionError = new Error('Node A failed')
			vi.mocked(mockRuntime.executeNode).mockRejectedValue(executionError)

			await jobHandler(job)

			expect(adapter.publishFinalResult).toHaveBeenCalledWith('run1', {
				status: 'failed',
				reason: executionError.message,
			})
			// Verify poison pill is written for successor 'C'
			expect(mockCoordinationStore.setIfNotExist).toHaveBeenCalledWith(
				'flowcraft:fanin:poison:run1:C',
				'poisoned',
				3600,
			)
		})

		it('should not write poison pill for "any" join successors when a node fails', async () => {
			const job: JobPayload = {
				runId: 'run1',
				blueprintId: 'fan-in-any',
				nodeId: 'A',
			}
			const executionError = new Error('Node A failed')
			vi.mocked(mockRuntime.executeNode).mockRejectedValue(executionError)

			await jobHandler(job)

			expect(adapter.publishFinalResult).toHaveBeenCalledWith('run1', {
				status: 'failed',
				reason: executionError.message,
			})
			// Should not write poison pill for 'any' join
			expect(mockCoordinationStore.setIfNotExist).not.toHaveBeenCalledWith(
				expect.stringContaining('poison'),
				expect.anything(),
				expect.anything(),
			)
		})

		it('should propagate enhanced error details from failed subflows', async () => {
			const subflowBlueprint: WorkflowBlueprint = {
				id: 'subflow-blueprint',
				nodes: [{ id: 'sub-node', uses: 'test' }],
				edges: [],
			}
			if (mockRuntime.options.blueprints) {
				vi.mocked(mockRuntime.options.blueprints)['subflow-blueprint'] = subflowBlueprint
			}

			const job: JobPayload = {
				runId: 'run1',
				blueprintId: 'linear',
				nodeId: 'subflow-node',
			}

			const subflowError = new Error('Subflow failure (Node: sub-node)')
			subflowError.stack = 'Stack trace from subflow'
			const enhancedError = new FlowcraftError(
				"Sub-workflow 'subflow-blueprint' did not complete successfully. Status: failed",
				{
					cause: subflowError,
					nodeId: 'subflow-node',
					blueprintId: 'subflow-blueprint',
					isFatal: false,
				},
			)

			vi.mocked(mockRuntime.executeNode).mockRejectedValue(enhancedError)

			await jobHandler(job)

			expect(adapter.publishFinalResult).toHaveBeenCalledWith('run1', {
				status: 'failed',
				reason: enhancedError.message,
			})
			// Verify that the error has cause with details
			expect(enhancedError.cause).toBeDefined()
			expect((enhancedError.cause as Error)?.message).toBe('Subflow failure (Node: sub-node)')
			expect((enhancedError.cause as Error)?.stack).toBe('Stack trace from subflow')
		})
	})

	describe('Reconciliation', () => {
		beforeEach(() => {
			// Reset the mock context for each test
			vi.mocked(mockContext.get).mockClear()
			vi.mocked(mockContext.set).mockClear()
			vi.mocked(mockContext.has).mockClear()
			vi.mocked(mockContext.toJSON).mockClear()
		})

		it('should persist blueprintId on first execution', async () => {
			const job: JobPayload = {
				runId: 'run1',
				blueprintId: 'linear',
				nodeId: 'A',
			}

			// First execution - blueprintId should not exist yet
			vi.mocked(mockContext.has).mockResolvedValue(false)

			vi.mocked(mockRuntime.executeNode).mockResolvedValue({
				output: 'Result from A',
			})
			vi.mocked(mockRuntime.determineNextNodes).mockResolvedValue([
				{ node: linearBlueprint.nodes[1], edge: linearBlueprint.edges[0] },
			])

			await jobHandler(job)

			expect(mockContext.has).toHaveBeenCalledWith('blueprintId')
			expect(mockContext.set).toHaveBeenCalledWith('blueprintId', 'linear')
		})

		it('should not persist blueprintId on subsequent executions', async () => {
			const job: JobPayload = {
				runId: 'run1',
				blueprintId: 'linear',
				nodeId: 'B',
			}

			// Subsequent execution - blueprintId should already exist
			vi.mocked(mockContext.has).mockResolvedValue(true)

			vi.mocked(mockRuntime.executeNode).mockResolvedValue({
				output: 'Final Result',
			})
			vi.mocked(mockRuntime.determineNextNodes).mockResolvedValue([])

			await jobHandler(job)

			expect(mockContext.has).toHaveBeenCalledWith('blueprintId')
			expect(mockContext.set).not.toHaveBeenCalledWith('blueprintId', 'linear')
		})

		it('should reconcile a linear workflow with completed nodes', async () => {
			// Simulate a workflow state where node A is completed
			vi.mocked(mockContext.get).mockResolvedValue('linear')
			// FIX: Use correct state structure
			vi.mocked(mockContext.toJSON).mockResolvedValue({ '_outputs.A': 'result from A' })

			const enqueuedNodes = await adapter.reconcile('run1')

			expect(enqueuedNodes).toEqual(new Set(['B']))
			expect(adapter.enqueueJob).toHaveBeenCalledWith({
				runId: 'run1',
				blueprintId: 'linear',
				nodeId: 'B',
			})
		})

		it('should reconcile a fan-in workflow with all predecessors completed', async () => {
			// Simulate a workflow state where both A and B are completed
			vi.mocked(mockContext.get).mockResolvedValue('fan-in')
			vi.mocked(mockContext.toJSON).mockResolvedValue({ '_outputs.A': 'result from A', '_outputs.B': 'result from B' })

			const enqueuedNodes = await adapter.reconcile('run1')

			expect(enqueuedNodes).toEqual(new Set(['C']))
			expect(adapter.enqueueJob).toHaveBeenCalledWith({
				runId: 'run1',
				blueprintId: 'fan-in',
				nodeId: 'C',
			})
		})

		it('should not enqueue nodes that are already locked', async () => {
			// Simulate a workflow state where node A is completed
			vi.mocked(mockContext.get).mockResolvedValue('linear')
			vi.mocked(mockContext.toJSON).mockResolvedValue({ '_outputs.A': 'result from A' })

			// Node B is already locked
			vi.mocked(mockCoordinationStore.setIfNotExist).mockResolvedValue(false)

			const enqueuedNodes = await adapter.reconcile('run1')

			expect(enqueuedNodes).toEqual(new Set())
			expect(adapter.enqueueJob).not.toHaveBeenCalled()
		})

		it('should handle any join strategy correctly', async () => {
			// Simulate a workflow state where node A is completed for fan-in-any
			vi.mocked(mockContext.get).mockResolvedValue('fan-in-any')
			vi.mocked(mockContext.toJSON).mockResolvedValue({ '_outputs.A': 'result from A' })

			// For 'any' joins, use the permanent join lock
			vi.mocked(mockCoordinationStore.setIfNotExist).mockResolvedValue(true)

			const enqueuedNodes = await adapter.reconcile('run1')

			expect(enqueuedNodes).toEqual(new Set(['B', 'C']))

			// Verify the permanent lock was acquired for the 'any' join node C
			expect(mockCoordinationStore.setIfNotExist).toHaveBeenCalledWith(
				'flowcraft:joinlock:run1:C',
				'locked-by-reconcile',
				3600,
			)

			// Verify jobs were enqueued for BOTH ready nodes
			expect(adapter.enqueueJob).toHaveBeenCalledWith({
				runId: 'run1',
				blueprintId: 'fan-in-any',
				nodeId: 'B',
			})
			expect(adapter.enqueueJob).toHaveBeenCalledWith({
				runId: 'run1',
				blueprintId: 'fan-in-any',
				nodeId: 'C',
			})
		})

		it('should not enqueue any join nodes that are already locked', async () => {
			// Simulate a workflow state where node A is completed for fan-in-any
			vi.mocked(mockContext.get).mockResolvedValue('fan-in-any')
			vi.mocked(mockContext.toJSON).mockResolvedValue({ '_outputs.A': 'result from A' })

			// For 'any' joins, the lock is already acquired
			vi.mocked(mockCoordinationStore.setIfNotExist).mockResolvedValue(false)

			const enqueuedNodes = await adapter.reconcile('run1')

			expect(enqueuedNodes).toEqual(new Set())
			expect(adapter.enqueueJob).not.toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'C' }))
		})

		it('should throw error if blueprintId is not found in context', async () => {
			vi.mocked(mockContext.get).mockResolvedValue(undefined)
			vi.mocked(mockCoordinationStore.get).mockResolvedValue(undefined)

			await expect(adapter.reconcile('run1')).rejects.toThrow(
				"Cannot reconcile runId 'run1': blueprintId not found in context or coordination store.",
			)
		})

		it('should throw error if blueprint is not found', async () => {
			vi.mocked(mockContext.get).mockResolvedValue('non-existent')
			vi.mocked(mockContext.toJSON).mockResolvedValue({})

			await expect(adapter.reconcile('run1')).rejects.toThrow(
				"Cannot reconcile runId 'run1': Blueprint with ID 'non-existent' not found.",
			)
		})

		it('should handle start nodes correctly', async () => {
			// Create a blueprint with a start node that has no predecessors
			const startNodeBlueprint: WorkflowBlueprint = {
				id: 'start-node',
				nodes: [
					{ id: 'start', uses: 'test' },
					{ id: 'output', uses: 'output' },
				],
				edges: [{ source: 'start', target: 'output' }],
			}
			if (mockRuntime.options.blueprints) {
				vi.mocked(mockRuntime.options.blueprints)['start-node'] = startNodeBlueprint
			}

			// No nodes completed yet, so start node should be enqueued
			vi.mocked(mockContext.get).mockResolvedValue('start-node')
			vi.mocked(mockContext.toJSON).mockResolvedValue({})

			const enqueuedNodes = await adapter.reconcile('run1')

			expect(enqueuedNodes).toEqual(new Set(['start']))
			expect(adapter.enqueueJob).toHaveBeenCalledWith({
				runId: 'run1',
				blueprintId: 'start-node',
				nodeId: 'start',
			})
		})

		it('should filter out internal keys when calculating completed nodes', async () => {
			// Simulate context with blueprintId and completed node A
			vi.mocked(mockContext.get).mockResolvedValue('linear')
			vi.mocked(mockContext.toJSON).mockResolvedValue({
				blueprintId: 'linear', // Internal key that should be filtered out
				'_outputs.A': 'result from A',
			})

			const enqueuedNodes = await adapter.reconcile('run1')

			expect(enqueuedNodes).toEqual(new Set(['B']))
			// Should only consider node keys, not blueprintId
			expect(adapter.enqueueJob).toHaveBeenCalledWith({
				runId: 'run1',
				blueprintId: 'linear',
				nodeId: 'B',
			})
		})
	})
})

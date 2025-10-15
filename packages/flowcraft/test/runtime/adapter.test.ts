import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
			setIfNotExist: vi.fn(),
			delete: vi.fn(),
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
			expect(mockContext.set).toHaveBeenCalledWith('A', 'Result from A')
			expect(adapter.enqueueJob).toHaveBeenCalledWith({
				runId: 'run1',
				blueprintId: 'linear',
				nodeId: 'B',
			})
			expect(adapter.publishFinalResult).not.toHaveBeenCalled()
		})

		it('should publish a "completed" result when a terminal "output" node finishes', async () => {
			const job: JobPayload = {
				runId: 'run1',
				blueprintId: 'linear',
				nodeId: 'B',
			}

			vi.mocked(mockRuntime.executeNode).mockResolvedValue({
				output: 'Final Result',
			})
			vi.mocked(mockRuntime.determineNextNodes).mockResolvedValue([]) // No more nodes

			await jobHandler(job)

			expect(mockRuntime.executeNode).toHaveBeenCalledWith(linearBlueprint, 'B', expect.any(Object))
			expect(adapter.enqueueJob).not.toHaveBeenCalled()
			expect(adapter.publishFinalResult).toHaveBeenCalledWith(
				'run1',
				expect.objectContaining({
					status: 'completed',
					payload: expect.objectContaining({ status: 'completed' }),
				}),
			)
		})

		it('should terminate a branch without completing the workflow if a non-output terminal node is reached', async () => {
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
				runId: 'run1',
				blueprintId: 'fan-in-any',
				nodeId: 'B',
			}
			vi.mocked(mockRuntime.executeNode).mockResolvedValue({ output: 'from B' })
			vi.mocked(mockRuntime.determineNextNodes).mockResolvedValue([
				{ node: fanInAnyBlueprint.nodes[2], edge: fanInAnyBlueprint.edges[1] },
			])
			// Second predecessor fails to acquire the lock
			vi.mocked(mockCoordinationStore.setIfNotExist).mockResolvedValue(false)

			await jobHandler(job)

			expect(mockCoordinationStore.setIfNotExist).toHaveBeenCalledWith('flowcraft:joinlock:run1:C', 'locked', 3600)
			expect(adapter.enqueueJob).not.toHaveBeenCalled()
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
	})
})

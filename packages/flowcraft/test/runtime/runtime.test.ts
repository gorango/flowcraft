import { describe, expect, it, vi } from 'vitest'
import { UnsafeEvaluator } from '../../src/evaluator'
import { FlowRuntime } from '../../src/runtime/runtime'
import { WorkflowState } from '../../src/runtime/state'

describe('FlowRuntime', () => {
	it('should initialize with options', () => {
		const runtime = new FlowRuntime({})
		expect(runtime.options).toEqual({})
	})

	it('should execute individual nodes', async () => {
		const blueprint = {
			id: 'node',
			nodes: [{ id: 'A', uses: 'test', params: {} }],
			edges: [],
		}
		const state = new WorkflowState({})
		const runtime = new FlowRuntime({})
		const mockExecutor = {
			execute: vi.fn().mockResolvedValue({ output: 'result' }),
		}
		vi.spyOn(runtime as any, 'getExecutor').mockReturnValue(mockExecutor)
		const result = await runtime.executeNode(blueprint, 'A', state)
		expect(result.output).toBe('result')
	})

	it('should determine next nodes correctly', async () => {
		const blueprint = {
			id: 'next',
			nodes: [
				{ id: 'A', uses: 'test', params: {} },
				{ id: 'B', uses: 'test', params: {} },
			],
			edges: [{ source: 'A', target: 'B' }],
		}
		const runtime = new FlowRuntime({})
		const result = { output: 'test' }
		const context = { type: 'sync', toJSON: vi.fn().mockReturnValue({}) } as any
		const nextNodes = await runtime.determineNextNodes(blueprint, 'A', result, context)
		expect(nextNodes).toHaveLength(1)
		expect(nextNodes[0].node.id).toBe('B')
	})

	it('should apply edge transforms', async () => {
		const runtime = new FlowRuntime({ evaluator: new UnsafeEvaluator() })
		const edge = { source: 'A', target: 'B', transform: 'input * 2' }
		const sourceResult = { output: 5 }
		const targetNode = { id: 'B', uses: 'test', params: {} }
		const context = {
			type: 'sync',
			set: vi.fn(),
			toJSON: vi.fn().mockReturnValue({}),
		} as any
		await runtime.applyEdgeTransform(edge, sourceResult, targetNode, context)
		expect(context.set).toHaveBeenCalledWith('B_input', 10)
	})

	it('should handle built-in nodes', async () => {
		const runtime = new FlowRuntime({})
		const nodeDef = {
			id: 'batch',
			uses: 'batch-scatter',
			params: { workerUsesKey: 'worker', gatherNodeId: 'gather' },
			inputs: 'data',
		}
		const context = {
			type: 'sync',
			get: vi.fn().mockResolvedValue(['item1']),
			set: vi.fn(),
		} as any
		const result = await (runtime as any)._executeBuiltInNode(nodeDef, context)
		expect(result.dynamicNodes).toBeDefined()
		expect(result.output.gatherNodeId).toBeDefined()
	})

	it('should respect abort signals', async () => {
		const controller = new AbortController()
		controller.abort()
		const blueprint = { id: 'cancel', nodes: [], edges: [] }
		const runtime = new FlowRuntime({})
		const result = await runtime.run(blueprint, {}, { signal: controller.signal })
		expect(result.status).toBe('cancelled')
	})
})

import { describe, expect, it } from 'vitest'
import { WorkflowState } from '../../src/runtime/state'

describe('WorkflowState', () => {
	it('should initialize with initial data', async () => {
		const initialData = { key: 'value' }
		const state = new WorkflowState(initialData)
		expect(await state.getContext().toJSON()).toEqual(initialData)
	})

	it('should add completed nodes correctly', async () => {
		const state = new WorkflowState({})
		await state.addCompletedNode('node1', 'output1')
		expect(state.getCompletedNodes().has('node1')).toBe(true)
		expect(await state.getContext().get('_outputs.node1')).toBe('output1')
	})

	it('should add errors correctly', () => {
		const state = new WorkflowState({})
		const error = new Error('Test error')
		state.addError('node1', error)
		const errors = state.getErrors()
		expect(errors).toHaveLength(1)
		expect(errors[0].nodeId).toBe('node1')
		expect(errors[0].message).toBe('Test error')
	})

	it('should clear errors for a node', () => {
		const state = new WorkflowState({})
		const error = new Error('Test error')
		state.addError('node1', error)
		state.clearError('node1')
		expect(state.getErrors()).toHaveLength(0)
	})

	it('should mark fallback as executed', () => {
		const state = new WorkflowState({})
		expect(state.getAnyFallbackExecuted()).toBe(false)
		state.markFallbackExecuted()
		expect(state.getAnyFallbackExecuted()).toBe(true)
	})

	it('should return correct status for completed workflow', () => {
		const state = new WorkflowState({})
		const allNodeIds = new Set<string>(['node1', 'node2'])
		const fallbackNodeIds = new Set<string>()
		state.addCompletedNode('node1', 'output1')
		state.addCompletedNode('node2', 'output2')
		expect(state.getStatus(allNodeIds, fallbackNodeIds)).toBe('completed')
	})

	it('should return correct status for failed workflow', () => {
		const state = new WorkflowState({})
		const allNodeIds = new Set<string>(['node1'])
		const fallbackNodeIds = new Set<string>()
		state.addError('node1', new Error('Fail'))
		expect(state.getStatus(allNodeIds, fallbackNodeIds)).toBe('failed')
	})

	it('should return correct status for stalled workflow', () => {
		const state = new WorkflowState({})
		const allNodeIds = new Set<string>(['node1', 'node2'])
		const fallbackNodeIds = new Set<string>()
		state.addCompletedNode('node1', 'output1')
		expect(state.getStatus(allNodeIds, fallbackNodeIds)).toBe('stalled')
	})

	it('should generate correct result object', async () => {
		const state = new WorkflowState({ initial: 'data' })
		const mockSerializer = {
			serialize: (data: any) => JSON.stringify(data),
			deserialize: (data: string) => JSON.parse(data),
		}
		const result = await state.toResult(mockSerializer)
		expect(result.context).toEqual({ initial: 'data' })
		expect(result.serializedContext).toBe('{"initial":"data"}')
		expect(result.status).toBe('completed')
	})
})

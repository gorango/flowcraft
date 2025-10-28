import { describe, expect, it } from 'vitest'
import { FlowcraftError } from '../src/errors'

describe('Custom Errors', () => {
	it('should correctly construct a FlowcraftError with all properties', () => {
		const originalError = new Error('original')
		const err = new FlowcraftError('Test message', {
			cause: originalError,
			nodeId: 'node-123',
			blueprintId: 'bp-abc',
			executionId: 'exec-id-1',
			isFatal: false,
		})

		expect(err).toBeInstanceOf(Error)
		expect(err.name).toBe('FlowcraftError')
		expect(err.message).toBe('Test message')
		expect(err.nodeId).toBe('node-123')
		expect(err.blueprintId).toBe('bp-abc')
		expect(err.cause).toBe(originalError)
		expect(err.executionId).toBe('exec-id-1')
		expect(err.isFatal).toBe(false)
	})

	it('should correctly construct a fatal FlowcraftError', () => {
		const err = new FlowcraftError('Fatal error', {
			nodeId: 'node-1',
			blueprintId: 'bp-1',
			isFatal: true,
		})

		expect(err).toBeInstanceOf(Error)
		expect(err.name).toBe('FlowcraftError')
		expect(err.message).toBe('Fatal error')
		expect(err.nodeId).toBe('node-1')
		expect(err.blueprintId).toBe('bp-1')
		expect(err.isFatal).toBe(true)
	})

	it('should handle missing options gracefully', () => {
		const err = new FlowcraftError('Simple error')

		expect(err).toBeInstanceOf(Error)
		expect(err.name).toBe('FlowcraftError')
		expect(err.message).toBe('Simple error')
		expect(err.nodeId).toBeUndefined()
		expect(err.blueprintId).toBeUndefined()
		expect(err.executionId).toBeUndefined()
		expect(err.isFatal).toBe(false)
	})
})

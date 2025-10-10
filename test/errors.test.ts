import { describe, expect, it } from 'vitest'
import { FatalNodeExecutionError, NodeExecutionError } from '../src/errors'

describe('Custom Errors', () => {
	it('should correctly construct a NodeExecutionError with all properties', () => {
		const originalError = new Error('original')
		const err = new NodeExecutionError(
			'Test message',
			'node-123',
			'bp-abc',
			originalError,
			'exec-id-1',
		)

		expect(err).toBeInstanceOf(Error)
		expect(err.name).toBe('NodeExecutionError')
		expect(err.message).toBe('Test message')
		expect(err.nodeId).toBe('node-123')
		expect(err.blueprintId).toBe('bp-abc')
		expect(err.originalError).toBe(originalError)
		expect(err.executionId).toBe('exec-id-1')
	})

	it('should correctly identify FatalNodeExecutionError as a subclass', () => {
		const err = new FatalNodeExecutionError('Fatal', 'node-1', 'bp-1')
		expect(err).toBeInstanceOf(NodeExecutionError)
		expect(err.name).toBe('FatalNodeExecutionError')
	})
})

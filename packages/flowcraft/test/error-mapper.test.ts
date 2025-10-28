import { describe, expect, it } from 'vitest'
import { createErrorMapper } from '../src/error-mapper'
import { FlowcraftError } from '../src/errors'
import type { WorkflowBlueprint } from '../src/types'

describe('createErrorMapper', () => {
	const mockManifest: Record<string, WorkflowBlueprint> = {
		testFlow: {
			id: 'testFlow',
			nodes: [
				{
					id: 'node1',
					uses: 'testStep',
					_sourceLocation: {
						file: '/app/src/test.ts',
						line: 10,
						column: 5,
					},
				},
				{
					id: 'node2',
					uses: 'anotherStep',
					_sourceLocation: {
						file: '/app/src/test.ts',
						line: 20,
						column: 8,
					},
				},
			],
			edges: [
				{
					source: 'node1',
					target: 'node2',
					_sourceLocation: {
						file: '/app/src/test.ts',
						line: 15,
						column: 2,
					},
				},
			],
		},
	}

	it('should enhance FlowcraftError with nodeId', () => {
		const mapError = createErrorMapper(mockManifest)
		const originalError = new FlowcraftError('Node execution failed', {
			nodeId: 'node1',
		})

		const mappedError = mapError(originalError)

		expect(mappedError.message).toBe('Workflow error at /app/src/test.ts:10:5. Original error: Node execution failed')
	})

	it('should extract nodeId from error message using regex', () => {
		const mapError = createErrorMapper(mockManifest)
		const originalError = new Error('Something went wrong with nodeId: node2 in the workflow')

		const mappedError = mapError(originalError)

		expect(mappedError.message).toBe(
			'Workflow error at /app/src/test.ts:20:8. Original error: Something went wrong with nodeId: node2 in the workflow',
		)
	})

	it('should return original error if no nodeId found', () => {
		const mapError = createErrorMapper(mockManifest)
		const originalError = new Error('Some unrelated error')

		const mappedError = mapError(originalError)

		expect(mappedError).toBe(originalError)
	})

	it('should return original error if nodeId not in manifest', () => {
		const mapError = createErrorMapper(mockManifest)
		const originalError = new FlowcraftError('Node execution failed', {
			nodeId: 'nonexistent',
		})

		const mappedError = mapError(originalError)

		expect(mappedError).toBe(originalError)
	})

	it('should handle edge source-target keys', () => {
		const mapError = createErrorMapper(mockManifest)
		const originalError = new Error('Error with nodeId: node1-node2')

		const mappedError = mapError(originalError)

		expect(mappedError.message).toBe(
			'Workflow error at /app/src/test.ts:15:2. Original error: Error with nodeId: node1-node2',
		)
	})
})

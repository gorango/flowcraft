import { Firestore } from '@google-cloud/firestore'
import type { PatchOperation } from 'flowcraft'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FirestoreContext } from './context'

// Mock Firestore
vi.mock('@google-cloud/firestore', () => {
	const mockUpdate = vi.fn().mockResolvedValue(undefined)
	const mockDoc = vi.fn().mockReturnValue({
		update: mockUpdate,
		set: vi.fn().mockResolvedValue(undefined),
		get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
	})
	const mockCollection = vi.fn().mockReturnValue({
		doc: mockDoc,
	})
	const mockFirestore = vi.fn().mockImplementation(
		class {
			collection = mockCollection
		} as any,
	)
	const FieldValue = {
		delete: vi.fn(),
	}
	;(mockFirestore as any).FieldValue = FieldValue

	return {
		Firestore: mockFirestore,
		FieldValue,
	}
})

describe('FirestoreContext - Unit Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('should support delta-based persistence with patch operations', async () => {
		const runId = 'test-delta-run'
		const mockFirestore = new Firestore()
		const context = new FirestoreContext(runId, {
			client: mockFirestore,
			collectionName: 'test-collection',
		})

		// Apply patch operations
		const operations: PatchOperation[] = [
			{ op: 'set', key: 'user', value: { id: 1, name: 'Alice Updated' } },
			{ op: 'set', key: 'count', value: 10 },
			{ op: 'delete', key: 'items' },
			{ op: 'set', key: 'status', value: 'completed' },
		]

		// The patch method should work without throwing
		await expect(context.patch(operations)).resolves.not.toThrow()
	})
})

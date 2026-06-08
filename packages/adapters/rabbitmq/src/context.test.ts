import type { PatchOperation } from 'flowcraft'
import type { Client as PgClient } from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgresContext } from './context'

// Mock PostgreSQL client
const mockQuery = vi.fn().mockResolvedValue({ rows: [{ context_data: {} }] })
const mockPgClient = {
	query: mockQuery,
} as unknown as PgClient

describe('PostgresContext - Unit Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockQuery.mockResolvedValue({ rows: [{ context_data: {} }] })
	})

	it('should support delta-based persistence with patch operations', async () => {
		const runId = 'test-delta-run'
		const context = new PostgresContext(runId, {
			client: mockPgClient,
			tableName: 'contexts',
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

		// Verify that query was called for the patch operation
		expect(mockQuery).toHaveBeenCalled()
	})
})

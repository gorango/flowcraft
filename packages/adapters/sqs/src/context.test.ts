import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { mockClient } from 'aws-sdk-client-mock'
import type { PatchOperation } from 'flowcraft'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DynamoDbContext } from './context'

// Mock DocumentClient
vi.mock('@aws-sdk/lib-dynamodb', () => ({
	DynamoDBDocumentClient: {
		from: vi.fn(() => mockDynamoClient),
	},
	GetCommand: vi.fn(),
	UpdateCommand: vi.fn(),
}))

const mockDynamoClient = mockClient(DynamoDBClient)

describe('DynamoDbContext - Unit Tests', () => {
	beforeEach(() => {
		mockDynamoClient.reset()
	})

	it('should support delta-based persistence with patch operations', async () => {
		const runId = 'test-delta-run'

		// Mock successful updates
		mockDynamoClient.on(UpdateItemCommand).resolves({})

		const context = new DynamoDbContext(runId, {
			client: mockDynamoClient as any,
			tableName: 'test-table',
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

import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type { IAsyncContext, PatchOperation } from 'flowcraft'

export interface DynamoDbContextOptions {
	client: DynamoDBClient
	tableName: string
}

/**
 * A distributed context that persists state in a DynamoDB item.
 * Each workflow run gets its own item, identified by the runId.
 */
export class DynamoDbContext implements IAsyncContext<Record<string, any>> {
	public readonly type = 'async' as const
	private readonly client: DynamoDBDocumentClient
	private readonly tableName: string
	private readonly runId: string

	constructor(runId: string, options: DynamoDbContextOptions) {
		this.runId = runId
		this.client = DynamoDBDocumentClient.from(options.client)
		this.tableName = options.tableName
	}

	async get<K extends string>(key: K): Promise<any> {
		const command = new GetCommand({
			TableName: this.tableName,
			Key: { runId: this.runId },
			ProjectionExpression: '#k',
			ExpressionAttributeNames: { '#k': key },
		})

		const result = await this.client.send(command)
		return result.Item?.[key]
	}

	async set<K extends string>(key: K, value: any): Promise<void> {
		const command = new UpdateCommand({
			TableName: this.tableName,
			Key: { runId: this.runId },
			UpdateExpression: 'SET #k = :v',
			ExpressionAttributeNames: { '#k': key },
			ExpressionAttributeValues: { ':v': value },
		})

		await this.client.send(command)
	}

	async has<K extends string>(key: K): Promise<boolean> {
		const command = new GetCommand({
			TableName: this.tableName,
			Key: { runId: this.runId },
			ProjectionExpression: '#k',
			ExpressionAttributeNames: { '#k': key },
		})
		const result = await this.client.send(command)
		return !!result.Item && Object.hasOwn(result.Item, key)
	}

	async delete<K extends string>(key: K): Promise<boolean> {
		const command = new UpdateCommand({
			TableName: this.tableName,
			Key: { runId: this.runId },
			UpdateExpression: 'REMOVE #k',
			ExpressionAttributeNames: { '#k': key },
			ReturnValues: 'UPDATED_OLD',
		})
		const result = await this.client.send(command)
		return !!result.Attributes
	}

	async toJSON(): Promise<Record<string, any>> {
		const command = new GetCommand({
			TableName: this.tableName,
			Key: { runId: this.runId },
		})

		const result = await this.client.send(command)
		if (result.Item) {
			const { runId: _, ...contextData } = result.Item
			return contextData
		}
		return {}
	}

	async patch(operations: PatchOperation[]): Promise<void> {
		if (operations.length === 0) return

		const setOperations = operations.filter((op) => op.op === 'set')
		const deleteOperations = operations.filter((op) => op.op === 'delete')

		const updateExpressions: string[] = []
		const expressionAttributeNames: Record<string, string> = {}
		const expressionAttributeValues: Record<string, any> = {}

		// Build SET expressions
		if (setOperations.length > 0) {
			const setParts = setOperations.map((op, index) => {
				const keyPlaceholder = `#k${index}`
				const valuePlaceholder = `:v${index}`
				expressionAttributeNames[keyPlaceholder] = op.key
				expressionAttributeValues[valuePlaceholder] = op.value
				return `${keyPlaceholder} = ${valuePlaceholder}`
			})
			updateExpressions.push(`SET ${setParts.join(', ')}`)
		}

		// Build REMOVE expressions
		if (deleteOperations.length > 0) {
			const removeParts = deleteOperations.map((op, index) => {
				const keyPlaceholder = `#d${index}`
				expressionAttributeNames[keyPlaceholder] = op.key
				return keyPlaceholder
			})
			updateExpressions.push(`REMOVE ${removeParts.join(', ')}`)
		}

		const command = new UpdateCommand({
			TableName: this.tableName,
			Key: { runId: this.runId },
			UpdateExpression: updateExpressions.join(' '),
			ExpressionAttributeNames: expressionAttributeNames,
			ExpressionAttributeValues: expressionAttributeValues,
		})

		await this.client.send(command)
	}
}

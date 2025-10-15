import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import type { IAsyncContext } from 'flowcraft'

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
	private readonly client: DynamoDBClient
	private readonly tableName: string
	private readonly runId: string

	constructor(runId: string, options: DynamoDbContextOptions) {
		this.runId = runId
		this.client = options.client
		this.tableName = options.tableName
	}

	private getKey() {
		return { runId: { S: this.runId } }
	}

	async get<K extends string>(key: K): Promise<any> {
		const command = new GetItemCommand({
			TableName: this.tableName,
			Key: this.getKey(),
			ProjectionExpression: '#k',
			ExpressionAttributeNames: { '#k': key },
		})

		const result = await this.client.send(command)
		if (result.Item?.[key]) {
			return unmarshall(result.Item)[key]
		}
		return undefined
	}

	async set<K extends string>(key: K, value: any): Promise<void> {
		const command = new UpdateItemCommand({
			TableName: this.tableName,
			Key: this.getKey(),
			UpdateExpression: 'SET #k = :v',
			ExpressionAttributeNames: { '#k': key },
			ExpressionAttributeValues: {
				':v': marshall(value, { removeUndefinedValues: true }),
			},
		})

		await this.client.send(command)
	}

	async has<K extends string>(key: K): Promise<boolean> {
		const command = new GetItemCommand({
			TableName: this.tableName,
			Key: this.getKey(),
			ProjectionExpression: '#k',
			ExpressionAttributeNames: { '#k': key },
		})
		const result = await this.client.send(command)
		return !!result.Item && Object.hasOwn(result.Item, key)
	}

	async delete<K extends string>(key: K): Promise<boolean> {
		const command = new UpdateItemCommand({
			TableName: this.tableName,
			Key: this.getKey(),
			UpdateExpression: 'REMOVE #k',
			ExpressionAttributeNames: { '#k': key },
			ReturnValues: 'UPDATED_OLD',
		})
		const result = await this.client.send(command)
		return !!result.Attributes
	}

	async toJSON(): Promise<Record<string, any>> {
		const command = new GetItemCommand({
			TableName: this.tableName,
			Key: this.getKey(),
		})

		const result = await this.client.send(command)
		if (result.Item) {
			const { runId: _, ...contextData } = unmarshall(result.Item)
			return contextData
		}
		return {}
	}
}

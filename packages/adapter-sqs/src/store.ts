import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DeleteItemCommand, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import type { ICoordinationStore } from 'flowcraft'

export interface DynamoDbCoordinationStoreOptions {
	client: DynamoDBClient
	tableName: string
	ttlSeconds?: number
}

/**
 * An ICoordinationStore implementation using DynamoDB for atomic operations.
 * This is ideal for managing fan-in joins and distributed locks.
 */
export class DynamoDbCoordinationStore implements ICoordinationStore {
	private readonly client: DynamoDBClient
	private readonly tableName: string
	private readonly defaultTtl: number

	constructor(options: DynamoDbCoordinationStoreOptions) {
		this.client = options.client
		this.tableName = options.tableName
		this.defaultTtl = options.ttlSeconds || 3600
	}

	private getTtl(ttlSeconds: number): number {
		return Math.floor(Date.now() / 1000) + ttlSeconds
	}

	async increment(key: string, ttlSeconds?: number): Promise<number> {
		const ttl = ttlSeconds ?? this.defaultTtl
		const command = new UpdateItemCommand({
			TableName: this.tableName,
			Key: { coordinationKey: { S: key } },
			UpdateExpression: 'SET #val = if_not_exists(#val, :zero) + :inc, #ttl = :ttl',
			ExpressionAttributeNames: {
				'#val': 'value',
				'#ttl': 'ttl',
			},
			ExpressionAttributeValues: {
				':inc': { N: '1' },
				':zero': { N: '0' },
				':ttl': { N: this.getTtl(ttl).toString() },
			},
			ReturnValues: 'UPDATED_NEW',
		})

		const result = await this.client.send(command)
		return Number(result.Attributes?.value?.N || '0')
	}

	async setIfNotExist(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
		const ttl = ttlSeconds ?? this.defaultTtl
		try {
			const command = new UpdateItemCommand({
				TableName: this.tableName,
				Key: { coordinationKey: { S: key } },
				UpdateExpression: 'SET #val = :val, #ttl = :ttl',
				ExpressionAttributeNames: {
					'#val': 'value',
					'#ttl': 'ttl',
				},
				ExpressionAttributeValues: {
					':val': { S: value },
					':ttl': { N: this.getTtl(ttl).toString() },
				},
				ConditionExpression: 'attribute_not_exists(coordinationKey)',
			})
			await this.client.send(command)
			return true
		} catch (error: any) {
			if (error.name === 'ConditionalCheckFailedException') {
				return false
			}
			throw error
		}
	}

	async delete(key: string): Promise<void> {
		const command = new DeleteItemCommand({
			TableName: this.tableName,
			Key: { coordinationKey: { S: key } },
		})
		await this.client.send(command)
	}

	async get(key: string): Promise<string | undefined> {
		const command = new GetItemCommand({
			TableName: this.tableName,
			Key: { coordinationKey: { S: key } },
		})
		const result = await this.client.send(command)
		return result.Item?.value?.S ?? undefined
	}
}

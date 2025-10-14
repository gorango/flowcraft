import type { Client as CassandraClient } from 'cassandra-driver'
import type { IAsyncContext } from 'flowcraft'

export interface CassandraContextOptions {
	client: CassandraClient
	keyspace: string
	tableName: string
}

/**
 * A distributed context that persists state in an Apache Cassandra table.
 * Uses runId as the partition key for fast, localized reads and writes.
 */
export class CassandraContext implements IAsyncContext<Record<string, any>> {
	public readonly type = 'async' as const
	private readonly client: CassandraClient
	private readonly tableName: string
	private readonly runId: string

	constructor(runId: string, options: CassandraContextOptions) {
		this.runId = runId
		this.client = options.client
		this.tableName = `${options.keyspace}.${options.tableName}`
	}

	private async readContext(): Promise<Record<string, any>> {
		const query = `SELECT context_data FROM ${this.tableName} WHERE run_id = ?`
		const result = await this.client.execute(query, [this.runId], { prepare: true })
		const row = result.first()
		return row ? JSON.parse(row.get('context_data')) : {}
	}

	private async writeContext(context: Record<string, any>): Promise<void> {
		const query = `INSERT INTO ${this.tableName} (run_id, context_data) VALUES (?, ?)`
		await this.client.execute(query, [this.runId, JSON.stringify(context)], { prepare: true })
	}

	async get<K extends string>(key: K): Promise<any> {
		const context = await this.readContext()
		return context[key]
	}

	async set<K extends string>(key: K, value: any): Promise<void> {
		// Cassandra requires a read-before-write pattern for partial JSON updates
		const context = await this.readContext()
		context[key] = value
		await this.writeContext(context)
	}

	async has<K extends string>(key: K): Promise<boolean> {
		const context = await this.readContext()
		return Object.prototype.hasOwnProperty.call(context, key)
	}

	async delete<K extends string>(key: K): Promise<boolean> {
		const context = await this.readContext()
		if (Object.prototype.hasOwnProperty.call(context, key)) {
			delete context[key]
			await this.writeContext(context)
			return true
		}
		return false
	}

	async toJSON(): Promise<Record<string, any>> {
		return this.readContext()
	}
}

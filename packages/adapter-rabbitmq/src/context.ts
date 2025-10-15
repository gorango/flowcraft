import type { IAsyncContext } from 'flowcraft'
import type { Client as PgClient } from 'pg'

export interface PostgresContextOptions {
	client: PgClient
	tableName: string
}

/**
 * A distributed context that persists state in a PostgreSQL table using a JSONB column.
 * Each workflow run gets its own row, identified by the runId.
 */
export class PostgresContext implements IAsyncContext<Record<string, any>> {
	public readonly type = 'async' as const
	private readonly pg: PgClient
	private readonly tableName: string
	private readonly runId: string

	constructor(runId: string, options: PostgresContextOptions) {
		this.runId = runId
		this.pg = options.client
		this.tableName = options.tableName
	}

	private async readContext(): Promise<Record<string, any>> {
		const res = await this.pg.query(`SELECT context_data FROM ${this.tableName} WHERE run_id = $1`, [this.runId])
		return res.rows[0]?.context_data || {}
	}

	async get<K extends string>(key: K): Promise<any> {
		const context = await this.readContext()
		return context[key]
	}

	async set<K extends string>(key: K, value: any): Promise<void> {
		const query = `
			INSERT INTO ${this.tableName} (run_id, context_data)
			VALUES ($1, $2)
			ON CONFLICT (run_id) DO UPDATE
			SET context_data = ${this.tableName}.context_data || $2;
		`
		await this.pg.query(query, [this.runId, JSON.stringify({ [key]: value })])
	}

	async has<K extends string>(key: K): Promise<boolean> {
		const context = await this.readContext()
		return Object.hasOwn(context, key)
	}

	async delete<K extends string>(key: K): Promise<boolean> {
		const query = `
			UPDATE ${this.tableName}
			SET context_data = context_data - $2
			WHERE run_id = $1 AND context_data ? $2;
		`
		const res = await this.pg.query(query, [this.runId, key])
		return !!res.rowCount
	}

	async toJSON(): Promise<Record<string, any>> {
		return this.readContext()
	}
}

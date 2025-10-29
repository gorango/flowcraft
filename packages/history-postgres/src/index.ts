import type { FlowcraftEvent, IEventStore } from 'flowcraft'
import { Pool, type PoolConfig } from 'pg'

export interface PostgresHistoryOptions extends PoolConfig {
	/**
	 * Table name for storing events (default: 'flowcraft_events')
	 */
	tableName?: string
	/**
	 * Whether to create tables automatically (default: true)
	 */
	autoCreateTables?: boolean
}

/**
 * PostgreSQL-based event store for Flowcraft workflow observability.
 * Stores workflow events in a PostgreSQL database for querying and replay.
 */
export class PostgresHistoryAdapter implements IEventStore {
	private pool: Pool
	private tableName: string
	private sequenceName: string
	private tablesInitialized = false

	constructor(options: PostgresHistoryOptions) {
		const { tableName = 'flowcraft_events', autoCreateTables = true, ...poolConfig } = options

		this.pool = new Pool(poolConfig)
		this.tableName = tableName
		this.sequenceName = `seq_${process.hrtime.bigint()}`

		if (autoCreateTables) {
			this.initializeTables()
		}
	}

	async initializeTables(): Promise<void> {
		if (this.tablesInitialized) {
			return
		}

		const client = await this.pool.connect()

		try {
			try {
				await client.query(`CREATE SEQUENCE IF NOT EXISTS ${this.sequenceName}`)
			} catch (_error) {}

			try {
				await client.query(`
					CREATE TABLE IF NOT EXISTS ${this.tableName} (
						id INTEGER PRIMARY KEY DEFAULT nextval('${this.sequenceName}'),
						execution_id TEXT NOT NULL,
						event_type TEXT NOT NULL,
						event_payload JSONB NOT NULL,
						timestamp TIMESTAMPTZ DEFAULT NOW(),
						created_at TIMESTAMPTZ DEFAULT NOW()
					)
				`)
			} catch (_error) {}

			try {
				await client.query(
					`CREATE INDEX IF NOT EXISTS idx_${this.tableName}_execution_id ON ${this.tableName}(execution_id)`,
				)
			} catch (_error) {}
			try {
				await client.query(
					`CREATE INDEX IF NOT EXISTS idx_${this.tableName}_event_type ON ${this.tableName}(event_type)`,
				)
			} catch (_error) {}

			this.tablesInitialized = true
		} finally {
			client.release()
		}
	}

	async store(event: FlowcraftEvent, executionId: string): Promise<void> {
		const client = await this.pool.connect()

		try {
			await client.query(
				`INSERT INTO ${this.tableName} (execution_id, event_type, event_payload) VALUES ($1, $2, $3)`,
				[executionId, event.type, JSON.stringify(event.payload)],
			)
		} finally {
			client.release()
		}
	}

	async retrieve(executionId: string): Promise<FlowcraftEvent[]> {
		const client = await this.pool.connect()

		try {
			const result = await client.query(
				`SELECT event_type, event_payload FROM ${this.tableName} WHERE execution_id = $1 ORDER BY timestamp ASC`,
				[executionId],
			)

			return result.rows.map((row) => ({
				type: row.event_type as FlowcraftEvent['type'],
				payload: row.event_payload,
			}))
		} finally {
			client.release()
		}
	}

	async retrieveMultiple(executionIds: string[]): Promise<Map<string, FlowcraftEvent[]>> {
		const result = new Map<string, FlowcraftEvent[]>()

		if (executionIds.length === 0) {
			return result
		}

		const client = await this.pool.connect()

		try {
			const placeholders = executionIds.map((_, i) => `$${i + 1}`).join(',')
			const query = `
				SELECT execution_id, event_type, event_payload
				FROM ${this.tableName}
				WHERE execution_id IN (${placeholders})
				ORDER BY execution_id, timestamp ASC
			`

			const queryResult = await client.query(query, executionIds)

			for (const row of queryResult.rows) {
				if (!result.has(row.execution_id)) {
					result.set(row.execution_id, [])
				}

				result.get(row.execution_id)?.push({
					type: row.event_type as FlowcraftEvent['type'],
					payload: row.event_payload,
				})
			}

			for (const executionId of executionIds) {
				if (!result.has(executionId)) {
					result.set(executionId, [])
				}
			}

			return result
		} finally {
			client.release()
		}
	}

	/**
	 * Close all database connections.
	 */
	async close(): Promise<void> {
		await this.pool.end()
	}

	/**
	 * Clear all events from the database (useful for testing).
	 */
	async clear(): Promise<void> {
		const client = await this.pool.connect()

		try {
			const result = await client.query(
				`
					SELECT EXISTS (
						SELECT 1 FROM information_schema.tables
						WHERE table_name = $1
					)
				`,
				[this.tableName],
			)

			if (result.rows[0].exists) {
				await client.query(`DELETE FROM ${this.tableName}`)
			}
		} finally {
			client.release()
		}
	}

	/**
	 * Get database statistics.
	 */
	async getStats(): Promise<{ totalEvents: number; executions: number }> {
		await this.initializeTables()

		const client = await this.pool.connect()

		try {
			const eventResult = await client.query(`SELECT COUNT(*) as count FROM ${this.tableName}`)
			const executionResult = await client.query(`SELECT COUNT(DISTINCT execution_id) as count FROM ${this.tableName}`)

			return {
				totalEvents: parseInt(eventResult.rows[0].count, 10),
				executions: parseInt(executionResult.rows[0].count, 10),
			}
		} finally {
			client.release()
		}
	}

	/**
	 * Drop the events table (useful for testing).
	 */
	async dropTable(): Promise<void> {
		const client = await this.pool.connect()

		try {
			await client.query(`DROP TABLE IF EXISTS ${this.tableName} CASCADE`)
			await client.query(`DROP SEQUENCE IF EXISTS ${this.sequenceName}`)
		} finally {
			client.release()
		}
	}

	/**
	 * Get the underlying pool (for advanced usage).
	 */
	getPool(): Pool {
		return this.pool
	}
}

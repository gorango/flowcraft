import Database from 'better-sqlite3'
import type { FlowcraftEvent, IEventStore } from 'flowcraft'

export interface SqliteHistoryOptions {
	/**
	 * Path to the SQLite database file. Use ':memory:' for in-memory database.
	 */
	databasePath: string
	/**
	 * Whether to enable WAL mode for better concurrent access
	 */
	walMode?: boolean
}

/**
 * SQLite-based event store for Flowcraft workflow observability.
 * Stores workflow events in a SQLite database for querying and replay.
 */
export class SqliteHistoryAdapter implements IEventStore {
	private db: Database.Database

	constructor(options: SqliteHistoryOptions) {
		this.db = new Database(options.databasePath)

		if (options.walMode !== false) {
			this.db.pragma('journal_mode = WAL')
		}

		this.initializeTables()
	}

	private initializeTables(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				execution_id TEXT NOT NULL,
				event_type TEXT NOT NULL,
				event_payload TEXT NOT NULL,
				timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`)

		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_events_execution_id ON events(execution_id);
			CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
			CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
		`)
	}

	async store(event: FlowcraftEvent, executionId: string): Promise<void> {
		const stmt = this.db.prepare(`
			INSERT INTO events (execution_id, event_type, event_payload)
			VALUES (?, ?, ?)
		`)

		stmt.run(executionId, event.type, JSON.stringify(event.payload))
	}

	async retrieve(executionId: string): Promise<FlowcraftEvent[]> {
		const stmt = this.db.prepare(`
			SELECT event_type, event_payload
			FROM events
			WHERE execution_id = ?
			ORDER BY timestamp ASC
		`)

		const rows = stmt.all(executionId) as Array<{ event_type: string; event_payload: string }>

		return rows.map((row) => ({
			type: row.event_type as FlowcraftEvent['type'],
			payload: JSON.parse(row.event_payload),
		}))
	}

	async retrieveMultiple(executionIds: string[]): Promise<Map<string, FlowcraftEvent[]>> {
		const result = new Map<string, FlowcraftEvent[]>()

		const placeholders = executionIds.map(() => '?').join(',')
		const stmt = this.db.prepare(`
			SELECT execution_id, event_type, event_payload
			FROM events
			WHERE execution_id IN (${placeholders})
			ORDER BY execution_id, timestamp ASC
		`)

		const rows = stmt.all(...executionIds) as Array<{
			execution_id: string
			event_type: string
			event_payload: string
		}>

		for (const row of rows) {
			if (!result.has(row.execution_id)) {
				result.set(row.execution_id, [])
			}

			result.get(row.execution_id)?.push({
				type: row.event_type as FlowcraftEvent['type'],
				payload: JSON.parse(row.event_payload),
			})
		}

		for (const executionId of executionIds) {
			if (!result.has(executionId)) {
				result.set(executionId, [])
			}
		}

		return result
	}

	/**
	 * Close the database connection.
	 */
	close(): void {
		this.db.close()
	}

	/**
	 * Clear all events from the database (useful for testing).
	 */
	clear(): void {
		this.db.exec('DELETE FROM events')
	}

	/**
	 * Get database statistics.
	 */
	getStats(): { totalEvents: number; executions: number } {
		const eventCount = this.db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number }
		const executionCount = this.db.prepare('SELECT COUNT(DISTINCT execution_id) as count FROM events').get() as {
			count: number
		}

		return {
			totalEvents: eventCount.count,
			executions: executionCount.count,
		}
	}
}

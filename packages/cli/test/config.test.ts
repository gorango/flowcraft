import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getHistoryConfig, loadConfig } from '../src/config.js'

describe('CLI Configuration', () => {
	let tempDir: string
	let configPath: string

	beforeEach(() => {
		tempDir = join(tmpdir(), `flowcraft-test-${Math.random().toString(36).substr(2, 9)}`)
		mkdirSync(tempDir, { recursive: true })
		configPath = join(tempDir, '.flowcraft.json')
	})

	afterEach(() => {
		try {
			rmSync(tempDir, { recursive: true, force: true })
		} catch {
			// Ignore cleanup errors
		}
	})

	it('should load config from file', () => {
		const config = {
			history: {
				type: 'sqlite' as const,
				sqlite: {
					databasePath: './test.db',
				},
			},
		}

		writeFileSync(configPath, JSON.stringify(config))
		process.env.FLOWCRAFT_CONFIG = configPath

		const loaded = loadConfig()
		expect(loaded).toEqual(config)

		delete process.env.FLOWCRAFT_CONFIG
	})

	it('should return null when no config file exists', () => {
		const loaded = loadConfig()
		expect(loaded).toBeNull()
	})

	it('should load SQLite config from environment', () => {
		process.env.FLOWCRAFT_HISTORY_TYPE = 'sqlite'
		process.env.FLOWCRAFT_SQLITE_PATH = './test.db'

		const config = getHistoryConfig()
		expect(config).toEqual({
			type: 'sqlite',
			sqlite: {
				databasePath: './test.db',
			},
		})

		delete process.env.FLOWCRAFT_HISTORY_TYPE
		delete process.env.FLOWCRAFT_SQLITE_PATH
	})

	it('should load PostgreSQL config from environment', () => {
		process.env.FLOWCRAFT_HISTORY_TYPE = 'postgres'
		process.env.FLOWCRAFT_POSTGRES_HOST = 'localhost'
		process.env.FLOWCRAFT_POSTGRES_PORT = '5432'
		process.env.FLOWCRAFT_POSTGRES_USER = 'user'
		process.env.FLOWCRAFT_POSTGRES_PASSWORD = 'pass'
		process.env.FLOWCRAFT_POSTGRES_DB = 'db'
		process.env.FLOWCRAFT_POSTGRES_TABLE = 'events'

		const config = getHistoryConfig()
		expect(config).toEqual({
			type: 'postgres',
			postgres: {
				host: 'localhost',
				port: 5432,
				user: 'user',
				password: 'pass',
				database: 'db',
				tableName: 'events',
			},
		})

		// Clean up
		delete process.env.FLOWCRAFT_HISTORY_TYPE
		delete process.env.FLOWCRAFT_POSTGRES_HOST
		delete process.env.FLOWCRAFT_POSTGRES_PORT
		delete process.env.FLOWCRAFT_POSTGRES_USER
		delete process.env.FLOWCRAFT_POSTGRES_PASSWORD
		delete process.env.FLOWCRAFT_POSTGRES_DB
		delete process.env.FLOWCRAFT_POSTGRES_TABLE
	})

	it('should return null when no configuration is available', () => {
		const config = getHistoryConfig()
		expect(config).toBeNull()
	})
})

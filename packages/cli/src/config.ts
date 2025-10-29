import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface HistoryConfig {
	type: 'sqlite' | 'postgres'
	sqlite?: {
		databasePath: string
	}
	postgres?: {
		host: string
		port: number
		user: string
		password: string
		database: string
		tableName?: string
	}
}

export interface CliConfig {
	history: HistoryConfig
}

const CONFIG_FILE_PATHS = [
	join(homedir(), '.flowcraft', 'config.json'),
	join(process.cwd(), '.flowcraft.json'),
	process.env.FLOWCRAFT_CONFIG,
].filter(Boolean) as string[]

export function loadConfig(): CliConfig | null {
	// Check environment variable first
	if (process.env.FLOWCRAFT_CONFIG) {
		try {
			const configContent = readFileSync(process.env.FLOWCRAFT_CONFIG, 'utf-8')
			const config = JSON.parse(configContent)
			return config
		} catch {
			// Continue to other paths
		}
	}

	for (const configPath of CONFIG_FILE_PATHS) {
		try {
			const configContent = readFileSync(configPath, 'utf-8')
			const config = JSON.parse(configContent)
			return config
		} catch {
			// Continue to next path
		}
	}

	return null
}

export function getHistoryConfig(): HistoryConfig | null {
	// Check command line args first (already handled by commander)
	// Then check environment variables
	if (process.env.FLOWCRAFT_HISTORY_TYPE === 'sqlite' && process.env.FLOWCRAFT_SQLITE_PATH) {
		return {
			type: 'sqlite',
			sqlite: {
				databasePath: process.env.FLOWCRAFT_SQLITE_PATH,
			},
		}
	}

	if (process.env.FLOWCRAFT_HISTORY_TYPE === 'postgres') {
		const user = process.env.FLOWCRAFT_POSTGRES_USER
		const password = process.env.FLOWCRAFT_POSTGRES_PASSWORD
		const database = process.env.FLOWCRAFT_POSTGRES_DB
		if (!user || !password || !database) {
			return null
		}
		return {
			type: 'postgres',
			postgres: {
				host: process.env.FLOWCRAFT_POSTGRES_HOST || 'localhost',
				port: parseInt(process.env.FLOWCRAFT_POSTGRES_PORT || '5432', 10),
				user,
				password,
				database,
				tableName: process.env.FLOWCRAFT_POSTGRES_TABLE,
			},
		}
	}

	// Finally check config file
	const config = loadConfig()
	return config?.history || null
}

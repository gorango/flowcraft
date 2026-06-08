import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { inspectCommand } from '../src/commands/inspect.js'

vi.mock('ora', () => ({
	default: vi.fn().mockImplementation(() => ({
		start: vi.fn().mockReturnThis(),
		succeed: vi.fn().mockReturnThis(),
		fail: vi.fn().mockReturnThis(),
	})),
}))

const createEvents = () => [
	{
		id: '1',
		executionId: 'test-run',
		type: 'workflow:start',
		timestamp: new Date().toISOString(),
		payload: { blueprintId: 'test-blueprint' },
	},
	{
		id: '2',
		executionId: 'test-run',
		type: 'node:start',
		timestamp: new Date().toISOString(),
		payload: { nodeId: 'node-1', input: {} },
	},
	{
		id: '3',
		executionId: 'test-run',
		type: 'node:finish',
		timestamp: new Date().toISOString(),
		payload: { nodeId: 'node-1', output: { result: 'ok' } },
	},
	{
		id: '4',
		executionId: 'test-run',
		type: 'workflow:finish',
		timestamp: new Date().toISOString(),
		payload: { status: 'completed', errors: [] },
	},
]

vi.mock('@flowcraft/sqlite-history', () => ({
	SqliteHistoryAdapter: class {
		async retrieve() {
			return createEvents()
		}
	},
}))

vi.mock('@flowcraft/postgres-history', () => ({
	PostgresHistoryAdapter: class {
		async retrieve() {
			return []
		}
	},
}))

vi.mock('flowcraft', () => ({
	FlowRuntime: class {
		async replay() {
			return {
				context: { result: 'test', key1: 'val1', key2: 'val2', key3: 'val3' },
			}
		}
	},
}))

vi.mock('../config.js', () => ({
	getHistoryConfig: vi.fn().mockReturnValue(null),
}))

describe('CLI Entry Point', () => {
	let consoleLogSpy: any

	beforeEach(() => {
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
		vi.spyOn(console, 'error').mockImplementation(() => {})
		vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('should export the inspect command', () => {
		expect(inspectCommand.name()).toBe('inspect')
		expect(inspectCommand.description()).toBe('Inspect a workflow execution')
	})

	it('should have all required options', () => {
		const options = inspectCommand.options
		const optionFlags = options.map((o: any) => o.flags)

		expect(optionFlags).toContain('-d, --database <path>')
		expect(optionFlags).toContain('--host <host>')
		expect(optionFlags).toContain('--port <port>')
		expect(optionFlags).toContain('--user <user>')
		expect(optionFlags).toContain('--password <password>')
		expect(optionFlags).toContain('--dbname <dbname>')
		expect(optionFlags).toContain('--table <table>')
		expect(optionFlags).toContain('--json')
	})

	it('should have sqlite option with description', () => {
		const dbOption = inspectCommand.options.find((o: any) => o.flags === '-d, --database <path>')
		expect(dbOption?.description).toBe('SQLite database path')
	})

	it('should have postgres options', () => {
		const optionNames = inspectCommand.options.map((o: any) => o.flags)
		expect(optionNames).toContain('--host <host>')
		expect(optionNames).toContain('--user <user>')
		expect(optionNames).toContain('--dbname <dbname>')
	})

	it('should have json option', () => {
		const jsonOption = inspectCommand.options.find((o: any) => o.flags === '--json')
		expect(jsonOption?.description).toBe('Output in JSON format')
	})

	it('should execute with sqlite database option', async () => {
		await inspectCommand.parseAsync(['node', 'inspect', 'test-run-id', '--database', './test.db'])

		expect(consoleLogSpy).toHaveBeenCalled()
		const output = consoleLogSpy.mock.calls.map((c: any) => c[0]).join(' ')
		expect(output).toContain('Workflow Execution Summary')
	})

	it('should output json format when --json is specified', async () => {
		await inspectCommand.parseAsync([
			'node',
			'inspect',
			'test-run-id',
			'--database',
			'./test.db',
			'--json',
		])

		expect(consoleLogSpy).toHaveBeenCalled()
		const jsonCall = consoleLogSpy.mock.calls.find((c: any) => {
			try {
				const parsed = JSON.parse(c[0])
				return parsed.some((e: any) => e.type === 'workflow:start')
			} catch {
				return false
			}
		})
		expect(jsonCall).toBeDefined()
	})

	it('should handle postgres options', async () => {
		await inspectCommand.parseAsync([
			'node',
			'inspect',
			'test-run-id',
			'--host',
			'localhost',
			'--user',
			'user',
			'--password',
			'pass',
			'--dbname',
			'testdb',
		])
	})
})

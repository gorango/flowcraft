import { PostgresHistoryAdapter } from '@flowcraft/postgres-history'
import { SqliteHistoryAdapter } from '@flowcraft/sqlite-history'
import chalk from 'chalk'
import { Command } from 'commander'
import { type FlowcraftEvent, FlowRuntime } from 'flowcraft'
import ora from 'ora'
import { table } from 'table'
import { getHistoryConfig } from '../config.js'

interface InspectOptions {
	database?: string
	host?: string
	port?: number
	user?: string
	password?: string
	dbname?: string
	table?: string
	json?: boolean
}

export const inspectCommand = new Command('inspect')
	.description('Inspect a workflow execution')
	.argument('<run-id>', 'Workflow run ID to inspect')
	.option('-d, --database <path>', 'SQLite database path')
	.option('--host <host>', 'PostgreSQL host')
	.option('--port <port>', 'PostgreSQL port', parseInt)
	.option('--user <user>', 'PostgreSQL user')
	.option('--password <password>', 'PostgreSQL password')
	.option('--dbname <dbname>', 'PostgreSQL database name')
	.option('--table <table>', 'History table name')
	.option('--json', 'Output in JSON format')
	.action(async (runId: string, options: InspectOptions) => {
		const spinner = ora('Loading workflow execution...').start()

		try {
			// Determine which history adapter to use
			let eventStore: { retrieve: (id: string) => Promise<FlowcraftEvent[]> }

			if (options.database) {
				// SQLite from command line
				eventStore = new SqliteHistoryAdapter({
					databasePath: options.database,
					walMode: true,
				})
			} else if (options.host && options.user && options.dbname) {
				// PostgreSQL from command line
				eventStore = new PostgresHistoryAdapter({
					host: options.host,
					port: options.port || 5432,
					user: options.user,
					password: options.password,
					database: options.dbname,
					tableName: options.table || 'flowcraft_events',
				})
			} else {
				// Try to load from config
				const config = getHistoryConfig()
				if (!config) {
					throw new Error(
						'Must specify database connection via command line options or config file.\n' +
							'See https://github.com/flowcraft/cli for configuration options.',
					)
				}

				if (config.type === 'sqlite' && config.sqlite) {
					eventStore = new SqliteHistoryAdapter({
						databasePath: config.sqlite.databasePath,
						walMode: true,
					})
				} else if (config.type === 'postgres' && config.postgres) {
					eventStore = new PostgresHistoryAdapter({
						host: config.postgres.host,
						port: config.postgres.port,
						user: config.postgres.user,
						password: config.postgres.password,
						database: config.postgres.database,
						tableName: config.postgres.tableName || 'flowcraft_events',
					})
				} else {
					throw new Error('Invalid history configuration')
				}
			}

			// Retrieve events for the run
			const events = await eventStore.retrieve(runId)

			if (events.length === 0) {
				spinner.fail(`No events found for run ID: ${runId}`)
				return
			}

			spinner.succeed(`Found ${events.length} events for run ${runId}`)

			if (options.json) {
				console.log(JSON.stringify(events, null, 2))
				return
			}

			// Create a runtime for replay (without any registries since we're just inspecting)
			const runtime = new FlowRuntime({})

			// Create a minimal blueprint for replay (since replay needs structure)
			const dummyBlueprint = {
				id: 'inspection-blueprint',
				nodes: [],
				edges: [],
			}

			// Replay the execution to get final state
			const replayResult = await runtime.replay(dummyBlueprint, events, runId)

			// Display the results
			displayWorkflowSummary(runId, events, replayResult)
		} catch (error) {
			spinner.fail(`Error inspecting workflow: ${error}`)
			process.exit(1)
		}
	})

function displayWorkflowSummary(runId: string, events: FlowcraftEvent[], replayResult: any) {
	console.log(chalk.bold.blue('\n🚀 Workflow Execution Summary'))
	console.log(chalk.gray('─'.repeat(50)))

	// Basic info
	const startEvent = events.find((e) => e.type === 'workflow:start')
	const finishEvent = events.find((e) => e.type === 'workflow:finish')

	if (startEvent) {
		console.log(`${chalk.bold('Run ID:')} ${runId}`)
		console.log(`${chalk.bold('Blueprint:')} ${startEvent.payload.blueprintId}`)
	}

	if (finishEvent) {
		const status = finishEvent.payload.status
		const statusColor = status === 'completed' ? chalk.green : chalk.red
		console.log(`${chalk.bold('Status:')} ${statusColor(status)}`)

		if (finishEvent.payload.errors && finishEvent.payload.errors.length > 0) {
			console.log(`${chalk.bold('Errors:')} ${finishEvent.payload.errors.length}`)
		}
	}

	// Node execution summary
	const nodeEvents = events.filter((e) => e.type.startsWith('node:'))
	const nodeStarts = nodeEvents.filter((e) => e.type === 'node:start')
	const nodeFinishes = nodeEvents.filter((e) => e.type === 'node:finish')
	const nodeErrors = nodeEvents.filter((e) => e.type === 'node:error')

	console.log(`\n${chalk.bold('📊 Execution Statistics')}`)
	console.log(chalk.gray('─'.repeat(30)))
	console.log(`${chalk.bold('Total Events:')} ${events.length}`)
	console.log(`${chalk.bold('Nodes Started:')} ${nodeStarts.length}`)
	console.log(`${chalk.bold('Nodes Completed:')} ${nodeFinishes.length}`)
	console.log(`${chalk.bold('Nodes Failed:')} ${nodeErrors.length}`)

	// Node timeline
	if (nodeStarts.length > 0) {
		console.log(`\n${chalk.bold('⏱️  Node Execution Timeline')}`)
		console.log(chalk.gray('─'.repeat(40)))

		const nodeTable = [['Node ID', 'Status', 'Duration']]

		// Group events by node
		const nodeGroups = new Map<string, FlowcraftEvent[]>()
		for (const event of nodeEvents) {
			if ('nodeId' in event.payload) {
				const nodeId = event.payload.nodeId
				if (!nodeGroups.has(nodeId)) {
					nodeGroups.set(nodeId, [])
				}
				nodeGroups.get(nodeId)?.push(event)
			}
		}

		for (const [nodeId, nodeEvents] of nodeGroups) {
			const startEvent = nodeEvents.find((e) => e.type === 'node:start')
			const finishEvent = nodeEvents.find((e) => e.type === 'node:finish')
			const errorEvent = nodeEvents.find((e) => e.type === 'node:error')

			let status = 'Unknown'
			let duration = 'N/A'

			if (errorEvent) {
				status = chalk.red('Failed')
			} else if (finishEvent) {
				status = chalk.green('Completed')
				// Note: We don't have actual timing data in events yet
				duration = '~'
			} else if (startEvent) {
				status = chalk.yellow('Running')
			}

			nodeTable.push([nodeId, status, duration])
		}

		console.log(
			table(nodeTable, {
				columns: {
					0: { alignment: 'left' },
					1: { alignment: 'center' },
					2: { alignment: 'right' },
				},
			}),
		)
	}

	// Context summary
	if (replayResult.context && Object.keys(replayResult.context).length > 0) {
		console.log(`\n${chalk.bold('📋 Final Context')}`)
		console.log(chalk.gray('─'.repeat(20)))

		const contextEntries = Object.entries(replayResult.context)
			.filter(([key]) => !key.startsWith('_')) // Hide internal keys
			.slice(0, 10) // Limit display

		for (const [key, value] of contextEntries) {
			const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value)
			const truncated = valueStr.length > 50 ? `${valueStr.substring(0, 47)}...` : valueStr
			console.log(`${chalk.cyan(key)}: ${truncated}`)
		}

		if (contextEntries.length < Object.keys(replayResult.context).length) {
			console.log(
				chalk.gray(`... and ${Object.keys(replayResult.context).length - contextEntries.length} more entries`),
			)
		}
	}

	console.log('')
}

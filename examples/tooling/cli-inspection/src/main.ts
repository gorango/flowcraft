import { SqliteHistoryAdapter } from '@flowcraft/sqlite-history'
import { ConsoleLogger, FlowRuntime, PersistentEventBusAdapter } from 'flowcraft'
import { createGreetingFlow } from './flow.js'

async function main() {
	// Create SQLite event store for persistent history
	const eventStore = new SqliteHistoryAdapter({
		databasePath: './workflow-events.db',
		walMode: true, // Enable WAL mode for better concurrent access
	})

	// Create persistent event bus
	const eventBus = new PersistentEventBusAdapter(eventStore)

	const greetingFlow = createGreetingFlow()

	// Get the serializable blueprint and the function registry.
	const blueprint = greetingFlow.toBlueprint()
	const functionRegistry = greetingFlow.getFunctionRegistry()

	// Create a runtime with persistent event storage
	const runtime = new FlowRuntime({
		logger: new ConsoleLogger(),
		eventBus, // Enable event persistence
	})

	console.log('Starting workflow with persistent event storage...')
	const result = await runtime.run(blueprint, {}, { functionRegistry })

	console.log('\n--- Workflow Complete ---')
	// Type-safe access to context values
	console.log('User Name:', result.context.user_name)
	console.log('Final Greeting:', result.context.final_greeting)
	console.log('Execution ID:', result.context._executionId)

	console.log('\n--- CLI Inspection ---')
	console.log('To inspect this workflow execution, run:')
	console.log(`npx @flowcraft/cli inspect ${result.context._executionId} --database ./workflow-events.db`)
	console.log('\nOr install globally and run:')
	console.log(`flowcraft inspect ${result.context._executionId} --database ./workflow-events.db`)
}

main().catch(console.error)

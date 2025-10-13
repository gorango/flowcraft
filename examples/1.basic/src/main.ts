import { ConsoleLogger, FlowRuntime } from 'flowcraft'
import { createGreetingFlow } from './flow.js'

// --- 3. Run the Workflow ---

async function main() {
	const greetingFlow = createGreetingFlow()

	// Get the serializable blueprint and the function registry.
	const blueprint = greetingFlow.toBlueprint()
	const functionRegistry = greetingFlow.getFunctionRegistry()

	// Create a runtime.
	const runtime = new FlowRuntime({
		logger: new ConsoleLogger(),
	})

	console.log('Starting workflow...')
	const result = await runtime.run(blueprint, {}, { functionRegistry })

	console.log('\n--- Workflow Complete ---')
	console.log('Final Greeting:', result.context['create-greeting'])
	console.log('Final Context:', result.context)
}

main()

import { ConsoleLogger, FlowRuntime } from 'flowcraft'
import { createGreetingFlow } from './flow.js'

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
	// Type-safe access to context values
	console.log('User Name:', result.context.user_name)
	console.log('Final Greeting:', result.context.final_greeting)
	console.log('Full Context:', result.context)
}

main()

import process from 'node:process'
import { ConsoleLogger, FlowRuntime } from 'flowcraft'
import { createAgentFlow } from './flow.js'

// --- Run the Agent ---
async function main() {
	const args = process.argv.slice(2)
	const questionArg = args.find(arg => arg !== '--') || args[args.length - 1]
	const question = questionArg || 'Who won the Nobel Prize in Physics 2024?'

	const agentFlow = createAgentFlow()
	const blueprint = agentFlow.toBlueprint()
	const functionRegistry = agentFlow.getFunctionRegistry()

	const runtime = new FlowRuntime({
		logger: new ConsoleLogger(),
	})

	const result = await runtime.run(
		blueprint,
		{ question },
		{ functionRegistry },
	)
	console.log('\n--- Agent Finished ---')
	console.log('Final Answer:', result.context.answer)
}

main()

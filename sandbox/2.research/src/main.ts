import process from 'node:process'
import dotenv from 'dotenv'
import { FlowcraftRuntime } from 'flowcraft'
import { createAgentFlow } from './flow.js'

dotenv.config()
const MAX_SEARCHES = 2

async function main() {
	let question = process.argv.slice(2).join(' ')
	if (!question) {
		question = 'Who won the Nobel Prize in Physics 2024?'
	}

	console.log(`🤔 Processing question: ${question}`)
	console.log(`(Agent will stop after ${MAX_SEARCHES} searches)`)

	const agentFlow = createAgentFlow()
	const blueprint = agentFlow.toBlueprint()
	const functionRegistry = agentFlow.getFunctionRegistry()

	const runtime = new FlowcraftRuntime({
		registry: {},
		environment: 'development',
	})

	const result = await runtime.run(
		blueprint,
		{
			input: question,
			search_count: 0,
			max_searches: MAX_SEARCHES,
		},
		functionRegistry,
	)

	console.log('\n🎯 Final Answer:')
	console.log(result.context.answer || 'No answer found.')
}

main().catch(console.error)

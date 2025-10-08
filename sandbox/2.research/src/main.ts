import type { Context } from 'flowcraft'
import process from 'node:process'
import dotenv from 'dotenv'
import { ConsoleLogger, TypedContext } from 'flowcraft'
import { createAgentFlow } from './flow.js'

dotenv.config()
const MAX_SEARCHES = 2

async function runAgent(question: string) {
	if (!question) {
		question = 'Who won the Nobel Prize in Physics 2024?'
	}

	const context: Context = new TypedContext([
		['question', question],
		['search_count', 0],
		['max_searches', MAX_SEARCHES],
	])

	console.log(`🤔 Processing question: ${question}`)
	console.log(`(Agent will stop after ${MAX_SEARCHES} searches)`)
	const agentFlow = createAgentFlow()
	await agentFlow.run(context, { logger: new ConsoleLogger() })
	console.log('\n🎯 Final Answer:')

	console.log(await context.get<string>('answer') || 'No answer found.')
}

const question = process.argv.slice(2).join(' ')
runAgent(question)

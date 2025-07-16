import type { Context } from 'workflow'
import process from 'node:process'
import dotenv from 'dotenv'
import { TypedContext } from 'workflow'
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
	await agentFlow.run(context)
	console.log('\n🎯 Final Answer:')

	console.log(context.get<string>('answer') || 'No answer found.')
}

const question = process.argv.slice(2).join(' ')
runAgent(question)

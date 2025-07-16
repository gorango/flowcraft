import type { Context } from 'workflow'
import process from 'node:process'
import dotenv from 'dotenv'
import { createArticleFlow } from './flow'

dotenv.config()

function runFlow(topic: string) {
	const context: Context = new Map<string, any>([['topic', topic]])
	console.log(`\n=== Starting Article Workflow on Topic: ${topic} ===\n`)
	const flow = createArticleFlow()
	flow.run(context)
	console.log('\n=== Workflow Completed ===\n')
	console.log(`Topic: ${context.get('topic')}`)
	console.log(`Final Article Length: ${context.get<string>('final_article')?.length || 0} characters`)
}

const topic = process.argv[2] || 'AI Safety'
runFlow(topic)

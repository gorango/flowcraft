import type { Context } from 'workflow'
import process from 'node:process'
import dotenv from 'dotenv'
import { TypedContext } from 'workflow'
import { createArticleFlow } from './flow'
import { FINAL_ARTICLE, TOPIC } from './nodes'

dotenv.config()

function runFlow(topic: string) {
	const context: Context = new TypedContext([[TOPIC, topic]])
	console.log(`\n=== Starting Article Workflow on Topic: ${topic} ===\n`)
	const flow = createArticleFlow()
	flow.run(context)
	console.log('\n=== Workflow Completed ===\n')
	console.log(`Topic: ${context.get(TOPIC)}`)
	console.log(`Final Article Length: ${context.get(FINAL_ARTICLE)?.length || 0} characters`)
}

const topic = process.argv[2] || 'AI Safety'
runFlow(topic)

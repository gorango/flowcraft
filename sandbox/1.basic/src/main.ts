import type { Context } from 'flowcraft'
import process from 'node:process'
import dotenv from 'dotenv'
import { ConsoleLogger, TypedContext } from 'flowcraft'
import { createArticleFlow } from './flow'
import { FINAL_ARTICLE, TOPIC } from './nodes'

dotenv.config()

async function runFlow(topic: string) {
	const context: Context = new TypedContext([[TOPIC, topic]])
	const logger = new ConsoleLogger()
	console.log(`\n=== Starting Article Workflow on Topic: ${topic} ===\n`)
	const flow = createArticleFlow()
	await flow.run(context, { logger })
	console.log('\n=== Workflow Completed ===\n')
	console.log(`Topic: ${await context.get(TOPIC)}`)
	console.log(`Final Article Length: ${(await context.get(FINAL_ARTICLE))?.length || 0} characters`)
}

const topic = process.argv[2] || 'AI Safety'
runFlow(topic)

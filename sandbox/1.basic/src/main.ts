import process from 'node:process'
import dotenv from 'dotenv'
import { FlowRuntime } from 'flowcraft'
import { createArticleFlow } from './flow.js'

dotenv.config()

async function main() {
	const topic = process.argv[2] || 'AI Safety'
	console.log(`\n=== Starting Article Workflow on Topic: ${topic} ===\n`)

	// 1. Create the workflow definition using the fluent builder.
	const articleFlow = createArticleFlow()

	// 2. Get the serializable blueprint and the function registry.
	const blueprint = articleFlow.toBlueprint()
	const functionRegistry = articleFlow.getFunctionRegistry()

	// 3. Create a runtime.
	const runtime = new FlowRuntime({})

	// 4. Run the workflow with an initial context.
	const result = await runtime.run(
		blueprint,
		{ topic }, // The first node is configured to read from the 'topic' key.
		{ functionRegistry },
	)

	console.log('\n=== Workflow Completed ===\n')
	console.log(`Topic: ${topic}`)
	console.log(`Final Article Length: ${result.context['apply-style']?.length || 0} characters`)
	console.log(`\nFull final context:\n`, result.context)
}

main().catch(console.error)

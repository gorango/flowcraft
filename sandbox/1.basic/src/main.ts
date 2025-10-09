import process from 'node:process'
import dotenv from 'dotenv'
import { FlowcraftRuntime } from 'flowcraft'
import { createArticleFlow } from './flow.js'

dotenv.config()

async function main() {
	const topic = process.argv[2] || 'AI Safety'
	console.log(`\n=== Starting Article Workflow V2 on Topic: ${topic} ===\n`)

	// 1. Create the workflow definition using the fluent builder.
	const articleFlow = createArticleFlow()

	// 2. Get the serializable blueprint and the function registry.
	const blueprint = articleFlow.toBlueprint()
	const functionRegistry = articleFlow.getFunctionRegistry()

	// 3. Create a runtime with the necessary node implementations.
	const runtime = new FlowcraftRuntime({
		registry: {}, // No pre-registered nodes needed for this example
		environment: 'development',
	})

	// 4. Run the workflow with an initial context. The topic is passed as 'input'.
	const result = await runtime.run(
		blueprint,
		{ input: topic }, // The first node receives this as its `input`
		functionRegistry,
	)

	console.log('\n=== Workflow Completed ===\n')
	console.log(`Topic: ${topic}`)
	console.log(`Final Article Length: ${result.context.input?.length || 0} characters`)
	console.log(`\nFull final context:\n`, result.context)
}

main().catch(console.error)

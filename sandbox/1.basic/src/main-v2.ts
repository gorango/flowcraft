import { FlowcraftRuntime } from '../../../src/v2/runtime.js'
import { createArticleFlowV2 } from './flow-v2.js'

async function runFlowV2(topic: string) {
	console.log(`\n=== Starting Article Workflow V2 on Topic: ${topic} ===\n`)

	// Create the workflow blueprint
	const workflow = createArticleFlowV2()
	const blueprint = workflow.toBlueprint()

	console.log('Blueprint:', JSON.stringify(blueprint, null, 2))

	// Create runtime
	const runtime = new FlowcraftRuntime({
		registry: {},
		environment: 'development',
	})

	// Run the workflow
	const result = await runtime.run(blueprint, {
		title: `Article about ${topic}`,
	})

	console.log('\n=== Workflow Completed ===\n')
	console.log('Final result:', JSON.stringify(result.context, null, 2))
	console.log(`Execution time: ${result.metadata.duration}ms`)
}

const topic = process.argv[2] || 'AI Safety'
runFlowV2(topic).catch(console.error)

import { ConsoleLogger, FlowRuntime } from 'flowcraft'
import { createUserProcessingWorkflow } from './workflow'

async function main() {
	console.log('🚀 Flowcraft Basic Workflow Execution Example\n')

	// Create the workflow blueprint
	const workflow = createUserProcessingWorkflow()
	const blueprint = workflow.toBlueprint()

	console.log('📋 Workflow Blueprint:')
	console.log(`   ID: ${blueprint.id}`)
	console.log(`   Nodes: ${blueprint.nodes.length}`)
	console.log(`   Edges: ${blueprint.edges.length}`)
	console.log()

	// Create a runtime with console logging
	const runtime = new FlowRuntime({
		logger: new ConsoleLogger(),
	})

	// Sample user data
	const sampleUser = {
		name: 'Alice Johnson',
		email: 'alice@example.com',
		age: 28,
	}

	console.log('👤 Input User Data:')
	console.log(JSON.stringify(sampleUser, null, 2))
	console.log()

	try {
		// Execute the workflow
		console.log('▶️  Starting workflow execution...\n')

		const result = await runtime.run(
			blueprint,
			{ user: sampleUser }, // Initial context
			{
				functionRegistry: workflow.getFunctionRegistry(),
			},
		)

		console.log('\n✅ Workflow completed successfully!')
		console.log('\n📊 Execution Results:')
		console.log(`   Status: ${result.status}`)
		console.log(`   Execution ID: ${result.context._executionId}`)

		console.log('\n📋 Final Context:')
		// Filter out internal Flowcraft keys for cleaner output
		const finalContext = Object.fromEntries(Object.entries(result.context).filter(([key]) => !key.startsWith('_')))
		console.log(JSON.stringify(finalContext, null, 2))
	} catch (error) {
		console.error('\n❌ Workflow failed:', error instanceof Error ? error.message : String(error))
		process.exit(1)
	}
}

main()

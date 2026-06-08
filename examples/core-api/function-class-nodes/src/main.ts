import { ConsoleLogger, FlowRuntime } from 'flowcraft'
import { createFunctionClassWorkflow } from './workflow'

async function main() {
	console.log('🚀 Flowcraft Function vs Class-Based Nodes Example\n')

	// Create the workflow
	const workflow = createFunctionClassWorkflow()
	const blueprint = workflow.toBlueprint()

	console.log('📋 Workflow Overview:')
	console.log(`   Demonstrates: Function-based vs Class-based nodes`)
	console.log(`   Nodes: ${Object.keys(blueprint.nodes).length}`)
	console.log(`   Function nodes: validateEmail, calculateUserScore`)
	console.log(`   Class nodes: UserProfileEnricher, NotificationSender`)
	console.log()

	// Sample user data
	const sampleUser = {
		name: 'Sarah Chen',
		email: 'sarah.chen@example.com',
		age: 32,
		preferences: ['tech', 'design', 'music'],
	}

	console.log('👤 Sample User Data:')
	console.log(JSON.stringify(sampleUser, null, 2))
	console.log()

	// Create runtime
	const runtime = new FlowRuntime({
		logger: new ConsoleLogger(),
	})

	try {
		console.log('▶️  Executing workflow with mixed node types...\n')

		const result = await runtime.run(
			blueprint,
			{ user: sampleUser },
			{
				functionRegistry: workflow.getFunctionRegistry(),
			},
		)

		console.log('\n✅ Workflow completed successfully!')
		console.log('\n📊 Final Results:')

		// Display key results
		const enrichedUser = result.context.enrichedUser
		const notificationsSent = result.context.notificationsSent

		console.log(`👤 User Level: ${enrichedUser.level}`)
		console.log(`🏆 User Score: ${enrichedUser.score}/100`)
		console.log(`🏅 Badges Earned: ${enrichedUser.badges.join(', ') || 'None'}`)
		console.log(`📧 Notifications Sent: ${notificationsSent}`)

		console.log('\n📋 Complete Final Context:')
		const cleanContext = Object.fromEntries(
			Object.entries(result.context).filter(([key]) => !key.startsWith('_')),
		)
		console.log(JSON.stringify(cleanContext, null, 2))
	} catch (error) {
		console.error('\n❌ Workflow failed:', error instanceof Error ? error.message : String(error))
		process.exit(1)
	}

	// Educational summary
	console.log(`\n${'='.repeat(60)}`)
	console.log('🎓 KEY DIFFERENCES: Function vs Class-Based Nodes')
	console.log('='.repeat(60))
	console.log()
	console.log('📄 FUNCTION-BASED NODES:')
	console.log('   ✅ Simple and concise')
	console.log('   ✅ Stateless (fresh instance each execution)')
	console.log('   ✅ Easy to test and reason about')
	console.log('   ✅ Good for simple, pure logic')
	console.log()
	console.log('🏗️  CLASS-BASED NODES:')
	console.log('   ✅ Can maintain state across executions')
	console.log('   ✅ Lifecycle methods (beforeExecute, afterExecute)')
	console.log('   ✅ Can encapsulate complex setup/teardown')
	console.log('   ✅ Better for nodes needing persistent connections')
	console.log()
	console.log('💡 WHEN TO USE WHICH:')
	console.log('   • Use functions for: pure logic, simple operations')
	console.log('   • Use classes for: stateful operations, lifecycle management')
	console.log('   • Both support async/await and full Flowcraft context API')
	console.log('='.repeat(60))
}

main()

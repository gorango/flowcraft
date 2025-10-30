import { type ContextImplementation, FlowRuntime, type Middleware, type NodeResult } from 'flowcraft'
import { createHITLWorkflow } from './workflow.js'

class HITLMiddleware implements Middleware {
	async aroundNode(
		_ctx: ContextImplementation<Record<string, any>>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	): Promise<NodeResult> {
		console.log(`[HITL] Starting ${nodeId}`)
		try {
			const result = await next()
			console.log(`[HITL] ${nodeId} completed`)
			return result
		} catch (error: any) {
			console.log(`[HITL] ${nodeId} failed: ${error.message}`)
			throw error
		}
	}
}

async function main() {
	console.log('🚀 Flowcraft Human-in-the-Loop (HITL) Workflow Example\n')

	// ============================================================================
	// HUMAN-IN-THE-LOOP WORKFLOW
	// ============================================================================
	console.log('='.repeat(60))
	console.log('👤 HUMAN-IN-THE-LOOP WORKFLOW')
	console.log('='.repeat(60))

	const runtime = new FlowRuntime({
		middleware: [new HITLMiddleware()],
	})

	try {
		const workflow = createHITLWorkflow()
		const result = await runtime.run(workflow.toBlueprint(), {}, { functionRegistry: workflow.getFunctionRegistry() })

		const approved = result.context.approved
		const executed = result.context.executed
		const handled = result.context.handled

		console.log(`\n✅ Workflow completed: ${approved ? 'Approved' : 'Rejected'}`)
		if (approved && executed) {
			console.log('   Task was executed successfully')
		} else if (!approved && handled) {
			console.log('   Rejection was handled')
		}
	} catch (error) {
		console.log(`❌ Workflow failed: ${(error as Error).message}`)
	}

	console.log('\n🎉 HITL workflow example completed!')
}

main().catch((error) => {
	console.error('💥 An error occurred:', error)
	process.exit(1)
})

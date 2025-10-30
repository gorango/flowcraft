import { type ContextImplementation, FlowRuntime, type Middleware, type NodeResult } from 'flowcraft'
import { createCompilerUsageWorkflow } from './workflow.js'

class CompilerMiddleware implements Middleware {
	async aroundNode(
		_ctx: ContextImplementation<Record<string, any>>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	): Promise<NodeResult> {
		console.log(`[COMPILER] Processing ${nodeId}`)
		try {
			const result = await next()
			console.log(`[COMPILER] ${nodeId} compiled successfully`)
			return result
		} catch (error: any) {
			console.log(`[COMPILER] ${nodeId} compilation failed: ${error.message}`)
			throw error
		}
	}
}

async function main() {
	console.log('🚀 Flowcraft Compiler Usage Example\n')

	// ============================================================================
	// COMPILER USAGE WORKFLOW
	// ============================================================================
	console.log('='.repeat(60))
	console.log('🔧 COMPILER USAGE WORKFLOW')
	console.log('='.repeat(60))

	const runtime = new FlowRuntime({
		middleware: [new CompilerMiddleware()],
	})

	// Create a sample workflow to analyze
	const sampleWorkflow = createCompilerUsageWorkflow()
	const sampleBlueprint = sampleWorkflow.toBlueprint()

	console.log('📋 Sample Workflow to Analyze:')
	console.log(`   ID: ${sampleBlueprint.id}`)
	console.log(`   Nodes: ${sampleBlueprint.nodes.map((n) => n.id).join(', ')}`)
	console.log()

	try {
		const workflow = createCompilerUsageWorkflow()
		const result = await runtime.run(
			workflow.toBlueprint(),
			{ workflow: sampleBlueprint },
			{ functionRegistry: workflow.getFunctionRegistry() },
		)

		console.log('\n✅ Compiler usage completed successfully!')
		console.log('\n📊 Compilation Results:')
		console.log(`   Status: ${result.status}`)
		console.log(`   Execution ID: ${result.context._executionId}`)

		const analysis = result.context.analysis
		if (analysis) {
			console.log(`   Analysis: ${analysis.nodeCount} nodes, ${analysis.edgeCount} edges`)
		}

		const generatedCode = result.context.generatedCode
		if (generatedCode) {
			console.log('\n📝 Generated Code Preview:')
			console.log(generatedCode)
		}
	} catch (error) {
		console.error('\n❌ Compiler usage failed:', (error as Error).message)
		process.exit(1)
	}

	console.log('\n🎉 Compiler usage example completed!')
}

main().catch((error) => {
	console.error('💥 An error occurred:', error)
	process.exit(1)
})

import type { Middleware, NodeResult } from 'flowcraft'
import { FlowRuntime } from 'flowcraft'
import { createComplexProcessingWorkflow } from './workflow.js'

class PerformanceMonitoringMiddleware implements Middleware {
	async aroundNode(
		_ctx: any,
		nodeId: string,
		next: () => Promise<NodeResult>,
	): Promise<NodeResult> {
		const start = Date.now()
		console.log(`[PERF] Starting ${nodeId} at ${new Date(start).toISOString()}`)
		try {
			const result = await next()
			const duration = Date.now() - start
			console.log(`[PERF] ${nodeId} completed successfully in ${duration}ms`)
			return result
		} catch (error: any) {
			const duration = Date.now() - start
			console.log(`[PERF] ${nodeId} failed in ${duration}ms: ${error.message}`)
			throw error
		}
	}
}

async function main() {
	console.log('🚀 Flowcraft Complex Patterns Example\n')

	// ============================================================================
	// COMPLEX DATA PROCESSING PIPELINE
	// ============================================================================
	console.log('='.repeat(60))
	console.log('🔬 COMPLEX DATA PROCESSING PIPELINE')
	console.log('='.repeat(60))

	const runtime = new FlowRuntime({
		middleware: [new PerformanceMonitoringMiddleware()],
	})

	// Sample input data
	const sampleInput = {
		items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
	}

	console.log('📥 Input Data:')
	console.log(JSON.stringify(sampleInput, null, 2))
	console.log()

	try {
		const workflow = createComplexProcessingWorkflow()
		const result = await runtime.run(
			workflow.toBlueprint(),
			{ input: sampleInput },
			{ functionRegistry: workflow.getFunctionRegistry() },
		)

		console.log('\n✅ Pipeline completed successfully!')
		console.log('\n📊 Execution Results:')
		console.log(`   Status: ${result.status}`)
		console.log(`   Execution ID: ${result.context._executionId}`)

		console.log('\n📋 Final Aggregated Data:')
		const aggregated = result.context.aggregated
		if (aggregated) {
			console.log(`   Count: ${aggregated.count}`)
			console.log(`   Sum: ${aggregated.sum}`)
			console.log(`   Average: ${aggregated.avg}`)
		}
	} catch (error) {
		console.error('\n❌ Pipeline failed:', (error as Error).message)
		process.exit(1)
	}

	console.log('\n🎉 Complex patterns example completed!')
}

main().catch((error) => {
	console.error('💥 An error occurred:', error)
	process.exit(1)
})

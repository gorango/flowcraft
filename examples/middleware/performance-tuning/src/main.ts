import { type ContextImplementation, FlowRuntime, type Middleware, type NodeResult } from 'flowcraft'
import { createPerformanceTunedWorkflow } from './workflow.js'

class PerformanceTuningMiddleware implements Middleware {
	async aroundNode(
		_ctx: ContextImplementation<Record<string, any>>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	): Promise<NodeResult> {
		const start = Date.now()
		console.log(`[TUNE] Starting ${nodeId}`)

		try {
			const result = await next()
			const duration = Date.now() - start

			console.log(`[TUNE] ${nodeId} completed in ${duration}ms`)

			// Performance suggestions
			if (duration > 80) {
				console.log(`[TUNE] ⚠️  ${nodeId} is slow (${duration}ms). Consider optimization.`)
			} else if (duration < 10) {
				console.log(`[TUNE] ✅ ${nodeId} is fast (${duration}ms).`)
			}

			return result
		} catch (error: any) {
			const duration = Date.now() - start
			console.log(`[TUNE] ${nodeId} failed in ${duration}ms`)
			throw error
		}
	}
}

async function main() {
	console.log('🚀 Flowcraft Performance Tuning Example\n')

	// ============================================================================
	// PERFORMANCE TUNED WORKFLOW
	// ============================================================================
	console.log('='.repeat(60))
	console.log('⚡ PERFORMANCE TUNED WORKFLOW')
	console.log('='.repeat(60))

	const middleware = new PerformanceTuningMiddleware()
	const runtime = new FlowRuntime({
		middleware: [middleware],
	})

	// Run multiple times to gather metrics
	const runs = 3
	for (let i = 1; i <= runs; i++) {
		console.log(`\n--- Run ${i} ---`)
		try {
			const workflow = createPerformanceTunedWorkflow()
			const result = await runtime.run(workflow.toBlueprint(), {}, { functionRegistry: workflow.getFunctionRegistry() })

			console.log(`✅ Run ${i} completed successfully`)

			// Show some results
			const report = result.context.report
			if (report) {
				console.log(`   Processed ${report.totalRecords} records, avg value: ${report.averageValue.toFixed(2)}`)
			}
		} catch (error) {
			console.error(`❌ Run ${i} failed: ${(error as Error).message}`)
		}
	}

	console.log('\n🎉 Performance tuning example completed!')
}

main().catch((error) => {
	console.error('💥 An error occurred:', error)
	process.exit(1)
})

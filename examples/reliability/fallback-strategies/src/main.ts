import { type ContextImplementation, FlowRuntime, type Middleware, type NodeResult } from 'flowcraft'
import { createCascadingFallbackWorkflow, createParallelFallbackWorkflow } from './workflow.js'

class FallbackMiddleware implements Middleware {
	async aroundNode(
		_ctx: ContextImplementation<Record<string, any>>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	): Promise<NodeResult> {
		console.log(`[FALLBACK] Starting ${nodeId}`)
		try {
			const result = await next()
			console.log(`[FALLBACK] ${nodeId} succeeded`)
			return result
		} catch (error: any) {
			console.log(`[FALLBACK] ${nodeId} failed: ${error.message} - attempting fallback if available`)
			throw error
		}
	}
}

class CascadingFallbackMiddleware implements Middleware {
	private failedServices: string[] = []

	async aroundNode(
		ctx: ContextImplementation<Record<string, any>>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	): Promise<NodeResult> {
		// Check if we should skip this service due to cascading fallback
		const serviceOrder = ['primaryService', 'secondaryService', 'tertiaryService']
		const currentIndex = serviceOrder.indexOf(nodeId)

		if (currentIndex > 0) {
			// Check if previous service succeeded
			const previousService = serviceOrder[currentIndex - 1]
			try {
				await ctx.get(`${previousService.replace('Service', '')}Result`)
				console.log(`[CASCADE] Skipping ${nodeId} because ${previousService} succeeded`)
				return { output: 'Skipped due to successful primary' }
			} catch {
				// Previous failed, continue with this one
			}
		}

		console.log(`[CASCADE] Attempting ${nodeId}`)
		try {
			const result = await next()
			console.log(`[CASCADE] ${nodeId} succeeded - stopping cascade`)
			return result
		} catch (error: any) {
			this.failedServices.push(nodeId)
			console.log(`[CASCADE] ${nodeId} failed: ${error.message}`)
			if (currentIndex < serviceOrder.length - 1) {
				console.log(`[CASCADE] Will try next service in cascade`)
			}
			throw error
		}
	}
}

async function main() {
	console.log('🚀 Flowcraft Fallback Strategies Example\n')

	// ============================================================================
	// CASCADING FALLBACK STRATEGY
	// ============================================================================
	console.log('='.repeat(60))
	console.log('🔗 CASCADING FALLBACK STRATEGY')
	console.log('='.repeat(60))

	const cascadingRuntime = new FlowRuntime({
		middleware: [new CascadingFallbackMiddleware()],
	})

	for (let i = 1; i <= 3; i++) {
		console.log(`\n--- Cascading Run ${i} ---`)
		try {
			const workflow = createCascadingFallbackWorkflow()
			const result = await cascadingRuntime.run(
				workflow.toBlueprint(),
				{},
				{ functionRegistry: workflow.getFunctionRegistry() },
			)
			const serviceUsed = result.context.serviceUsed
			console.log(`✅ Cascading run ${i} completed using ${serviceUsed}`)
		} catch (error) {
			console.log(`❌ Cascading run ${i} failed: ${(error as Error).message}`)
		}
	}

	// ============================================================================
	// PARALLEL FALLBACK STRATEGY
	// ============================================================================
	console.log(`\n${'='.repeat(60)}`)
	console.log('🔀 PARALLEL FALLBACK STRATEGY')
	console.log('='.repeat(60))

	const parallelRuntime = new FlowRuntime({
		middleware: [new FallbackMiddleware()],
	})

	for (let i = 1; i <= 3; i++) {
		console.log(`\n--- Parallel Run ${i} ---`)
		try {
			const workflow = createParallelFallbackWorkflow()
			const _result = await parallelRuntime.run(
				workflow.toBlueprint(),
				{},
				{ functionRegistry: workflow.getFunctionRegistry() },
			)
			console.log(`✅ Parallel run ${i} completed`)
			// In parallel, both services run, but processResponse uses whichever succeeded
		} catch (error) {
			console.log(`❌ Parallel run ${i} failed: ${(error as Error).message}`)
		}
	}

	console.log('\n🎉 Fallback strategies example completed!')
}

main().catch((error) => {
	console.error('💥 An error occurred:', error)
	process.exit(1)
})

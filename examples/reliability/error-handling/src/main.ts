import { type ContextImplementation, FlowRuntime, type Middleware, type NodeResult } from 'flowcraft'
import { createErrorHandlingWorkflow, createRetryWorkflow } from './workflow.js'

class RetryMiddleware implements Middleware {
	async aroundNode(
		_ctx: ContextImplementation<Record<string, any>>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	): Promise<NodeResult> {
		const maxRetries = 3
		let attempts = 0

		while (attempts < maxRetries) {
			try {
				console.log(`[RETRY] Attempting ${nodeId} (attempt ${attempts + 1}/${maxRetries})`)
				const result = await next()
				console.log(`[RETRY] ${nodeId} succeeded on attempt ${attempts + 1}`)
				return result
			} catch (error: any) {
				attempts++
				if (attempts < maxRetries) {
					console.log(`[RETRY] ${nodeId} failed: ${error.message} - retrying in 100ms...`)
					await new Promise((resolve) => setTimeout(resolve, 100))
				} else {
					console.log(`[RETRY] ${nodeId} failed permanently after ${maxRetries} attempts`)
					throw error
				}
			}
		}
		throw new Error('Unexpected retry loop exit')
	}
}

class ErrorHandlingMiddleware implements Middleware {
	async aroundNode(
		_ctx: ContextImplementation<Record<string, any>>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	): Promise<NodeResult> {
		try {
			console.log(`[ERROR] Starting ${nodeId}`)
			const result = await next()
			console.log(`[ERROR] ${nodeId} completed successfully`)
			return result
		} catch (error: any) {
			console.log(`[ERROR] ${nodeId} failed: ${error.message} - executing error handling`)
			// Simulate error handling logic
			console.log(`[ERROR] Error handled for ${nodeId}`)
			throw error // Re-throw to propagate
		}
	}
}

async function main() {
	console.log('🚀 Flowcraft Error Handling and Reliability Example\n')

	// ============================================================================
	// RETRY MECHANISM EXAMPLE
	// ============================================================================
	console.log('='.repeat(60))
	console.log('🔄 RETRY MECHANISM EXAMPLE')
	console.log('='.repeat(60))

	const retryRuntime = new FlowRuntime({
		middleware: [new RetryMiddleware()],
	})

	for (let i = 1; i <= 3; i++) {
		console.log(`\n--- Run ${i} ---`)
		try {
			const retryWorkflow = createRetryWorkflow()
			const _retryResult = await retryRuntime.run(
				retryWorkflow.toBlueprint(),
				{},
				{ functionRegistry: retryWorkflow.getFunctionRegistry() },
			)
			console.log(`✅ Run ${i} completed successfully`)
		} catch (error) {
			console.log(`❌ Run ${i} failed: ${(error as Error).message}`)
		}
	}

	// ============================================================================
	// ERROR HANDLING EXAMPLE
	// ============================================================================
	console.log(`\n${'='.repeat(60)}`)
	console.log('🚨 ERROR HANDLING EXAMPLE')
	console.log('='.repeat(60))

	const errorRuntime = new FlowRuntime({
		middleware: [new ErrorHandlingMiddleware()],
	})

	try {
		const errorWorkflow = createErrorHandlingWorkflow()
		const _errorResult = await errorRuntime.run(
			errorWorkflow.toBlueprint(),
			{},
			{ functionRegistry: errorWorkflow.getFunctionRegistry() },
		)
		if (_errorResult.status === 'failed') {
			console.log('\n🛡️ Error Handling Results:')
			console.log('   Error was caught and handled by middleware')
		} else {
			console.log('\n🛡️ Error Handling Results:')
			console.log('   Workflow completed without errors')
		}
	} catch (error) {
		console.log('\n🛡️ Error Handling Results:')
		console.log('   Unexpected error:', error)
	}

	console.log('\n🎉 All error handling and reliability examples completed!')
}

main().catch((error) => {
	console.error('💥 An error occurred:', error)
	process.exit(1)
})

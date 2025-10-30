import { type ContextImplementation, FlowRuntime, type Middleware, type NodeResult } from 'flowcraft'
import { createBasicLoggingWorkflow, createErrorLoggingWorkflow, createStructuredLoggingWorkflow } from './workflow.js'

class LoggingMiddleware implements Middleware {
	async aroundNode(
		_ctx: ContextImplementation<Record<string, any>>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	): Promise<NodeResult> {
		console.log(`[LOG] Starting node: ${nodeId}`)
		const result = await next()
		console.log(`[LOG] Completed node: ${nodeId}`)
		return result
	}
}

class StructuredLoggingMiddleware implements Middleware {
	async aroundNode(
		_ctx: ContextImplementation<Record<string, any>>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	): Promise<NodeResult> {
		const start = Date.now()
		console.log(`[STRUCTURED] Node ${nodeId} started at ${new Date(start).toISOString()}`)
		try {
			const result = await next()
			const duration = Date.now() - start
			console.log(`[STRUCTURED] Node ${nodeId} completed in ${duration}ms`)
			return result
		} catch (error: any) {
			const duration = Date.now() - start
			console.log(`[STRUCTURED] Node ${nodeId} failed in ${duration}ms: ${error.message}`)
			throw error
		}
	}
}

async function main() {
	console.log('🚀 Flowcraft Custom Logging Middleware Example\n')

	// ============================================================================
	// BASIC LOGGING EXAMPLE
	// ============================================================================
	console.log('='.repeat(60))
	console.log('📝 BASIC LOGGING EXAMPLE')
	console.log('='.repeat(60))

	const basicRuntime = new FlowRuntime({
		middleware: [new LoggingMiddleware()],
	})

	try {
		const basicWorkflow = createBasicLoggingWorkflow()
		const _basicResult = await basicRuntime.run(
			basicWorkflow.toBlueprint(),
			{},
			{ functionRegistry: basicWorkflow.getFunctionRegistry() },
		)

		console.log('\n📊 Basic Logging Results:')
		console.log('   Workflow completed successfully with logging')
	} catch (error) {
		console.error('❌ Basic logging failed:', error)
	}

	// ============================================================================
	// STRUCTURED LOGGING EXAMPLE
	// ============================================================================
	console.log('='.repeat(60))
	console.log('📊 STRUCTURED LOGGING EXAMPLE')
	console.log('='.repeat(60))

	const structuredRuntime = new FlowRuntime({
		middleware: [new StructuredLoggingMiddleware()],
	})

	try {
		const structuredWorkflow = createStructuredLoggingWorkflow()
		const _structuredResult = await structuredRuntime.run(
			structuredWorkflow.toBlueprint(),
			{},
			{ functionRegistry: structuredWorkflow.getFunctionRegistry() },
		)

		console.log('\n📈 Structured Logging Results:')
		console.log('   All nodes executed with timing information')
	} catch (error) {
		console.error('❌ Structured logging failed:', error)
	}

	// ============================================================================
	// ERROR LOGGING EXAMPLE
	// ============================================================================
	console.log('='.repeat(60))
	console.log('🚨 ERROR LOGGING EXAMPLE')
	console.log('='.repeat(60))

	const errorRuntime = new FlowRuntime({
		middleware: [new StructuredLoggingMiddleware()],
	})

	try {
		const errorWorkflow = createErrorLoggingWorkflow()
		const _errorResult = await errorRuntime.run(
			errorWorkflow.toBlueprint(),
			{},
			{ functionRegistry: errorWorkflow.getFunctionRegistry() },
		)

		if (_errorResult.status === 'failed') {
			console.log('\n🚨 Error Logging Results:')
			console.log('   Error was logged and propagated correctly')
		} else {
			console.log('\n🚨 Error Logging Results:')
			console.log('   No error occurred')
		}
	} catch (_error) {
		console.log('\n🚨 Error Logging Results:')
		console.log('   Unexpected error:', _error)
	}

	console.log('🎉 All custom logging middleware examples completed!')
}

// Handle errors and run the main function
main().catch((error) => {
	console.error('💥 An error occurred:', error)
	process.exit(1)
})

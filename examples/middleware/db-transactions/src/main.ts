import { type ContextImplementation, FlowRuntime, type Middleware, type NodeResult } from 'flowcraft'
import { createFailingTransactionWorkflow, createSuccessfulTransactionWorkflow } from './workflow.js'

class TransactionMiddleware implements Middleware {
	async aroundNode(
		_ctx: ContextImplementation<Record<string, any>>,
		nodeId: string,
		next: () => Promise<NodeResult>,
	): Promise<NodeResult> {
		console.log(`[TXN] Starting database operation: ${nodeId}`)
		try {
			const result = await next()
			console.log(`[TXN] Operation ${nodeId} completed successfully`)
			return result
		} catch (error: any) {
			console.log(`[TXN] Operation ${nodeId} failed - initiating rollback: ${error.message}`)
			// Simulate rollback
			console.log(`[TXN] Rollback completed for operation ${nodeId}`)
			throw error
		}
	}
}

async function main() {
	console.log('🚀 Flowcraft Database Transaction Middleware Example\n')

	// ============================================================================
	// SUCCESSFUL TRANSACTION EXAMPLE
	// ============================================================================
	console.log('='.repeat(60))
	console.log('✅ SUCCESSFUL TRANSACTION EXAMPLE')
	console.log('='.repeat(60))

	const successRuntime = new FlowRuntime({
		middleware: [new TransactionMiddleware()],
	})

	try {
		const successWorkflow = createSuccessfulTransactionWorkflow()
		const _successResult = await successRuntime.run(
			successWorkflow.toBlueprint(),
			{},
			{ functionRegistry: successWorkflow.getFunctionRegistry() },
		)

		console.log('\n💾 Successful Transaction Results:')
		console.log('   All database operations completed successfully')
		console.log('   Transaction committed')
	} catch (error) {
		console.error('❌ Unexpected error in successful transaction:', error)
	}

	// ============================================================================
	// FAILING TRANSACTION EXAMPLE
	// ============================================================================
	console.log('='.repeat(60))
	console.log('❌ FAILING TRANSACTION EXAMPLE')
	console.log('='.repeat(60))

	const failRuntime = new FlowRuntime({
		middleware: [new TransactionMiddleware()],
	})

	try {
		const failWorkflow = createFailingTransactionWorkflow()
		const _failResult = await failRuntime.run(
			failWorkflow.toBlueprint(),
			{},
			{ functionRegistry: failWorkflow.getFunctionRegistry() },
		)

		if (_failResult.status === 'failed') {
			console.log('\n💥 Failing Transaction Results:')
			console.log('   Transaction rolled back due to error')
		} else {
			console.log('\n💥 Failing Transaction Results:')
			console.log('   Unexpected success')
		}
	} catch (error) {
		console.error('❌ Unexpected error in failing transaction:', error)
	}

	console.log('🎉 All database transaction middleware examples completed!')
}

main().catch((error) => {
	console.error('💥 An error occurred:', error)
	process.exit(1)
})

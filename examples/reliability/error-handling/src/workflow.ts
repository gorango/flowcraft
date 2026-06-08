import { createFlow, type NodeContext } from 'flowcraft'

interface WorkflowContext {
	operationDone: boolean
	recovered: boolean
}

// ============================================================================
// ERROR HANDLING NODES
// ============================================================================

async function unstableOperation(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('! Performing unstable operation...')
	// Simulate random failure
	if (Math.random() > 0.7) {
		console.log('❌ Operation failed')
		throw new Error('Random failure')
	}
	console.log('✅ Operation succeeded')
	await context.set('operationDone', true)
	return { output: 'Operation completed' }
}

async function criticalOperation(): Promise<{ output: string }> {
	console.log('🔴 Performing critical operation...')
	// Always fails
	throw new Error('Critical system error')
}

async function recoveryOperation(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🔧 Performing recovery operation...')
	await context.set('recovered', true)
	return { output: 'Recovery completed' }
}

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

/** Creates a workflow with retry logic */
export function createRetryWorkflow() {
	return createFlow<WorkflowContext>('retry-workflow').node('unstableOperation', unstableOperation)
}

/** Creates a workflow with error handling */
export function createErrorHandlingWorkflow() {
	return createFlow<WorkflowContext>('error-handling-workflow')
		.node('criticalOperation', criticalOperation)
		.node('recoveryOperation', recoveryOperation)
		.edge('criticalOperation', 'recoveryOperation')
}

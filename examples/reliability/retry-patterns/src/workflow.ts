import { createFlow, type NodeContext } from 'flowcraft'

interface WorkflowContext {
	attempts: number
}

// ============================================================================
// RETRY PATTERNS NODES
// ============================================================================

async function unreliableOperation(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('⚠️ Executing unreliable operation...')
	// Simulate random failure (70% failure rate)
	if (Math.random() > 0.3) {
		console.log('❌ Operation failed')
		throw new Error('Service temporarily unavailable')
	}
	console.log('✅ Operation succeeded')
	await context.set('operationResult', 'success')
	return { output: 'Operation completed' }
}

async function criticalTask(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🔴 Executing critical task...')
	// Simulate high failure rate (80%)
	if (Math.random() > 0.2) {
		console.log('💥 Critical task failed')
		throw new Error('Critical system failure')
	}
	console.log('✅ Critical task succeeded')
	await context.set('criticalResult', 'success')
	return { output: 'Critical task completed' }
}

async function backupOperation(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🔄 Executing backup operation...')
	// Simulate lower failure rate (20%)
	if (Math.random() > 0.8) {
		console.log('❌ Backup operation failed')
		throw new Error('Backup service error')
	}
	console.log('✅ Backup operation succeeded')
	await context.set('backupResult', 'success')
	return { output: 'Backup operation completed' }
}

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

/** Creates a workflow demonstrating fixed delay retry */
export function createFixedDelayRetryWorkflow() {
	return createFlow<WorkflowContext>('fixed-delay-retry-workflow').node('unreliableOperation', unreliableOperation)
}

/** Creates a workflow demonstrating exponential backoff retry */
export function createExponentialBackoffRetryWorkflow() {
	return createFlow<WorkflowContext>('exponential-backoff-retry-workflow').node('criticalTask', criticalTask)
}

/** Creates a workflow demonstrating circuit breaker pattern */
export function createCircuitBreakerWorkflow() {
	return createFlow<WorkflowContext>('circuit-breaker-workflow')
		.node('unreliableOperation', unreliableOperation)
		.node('backupOperation', backupOperation)
		.edge('unreliableOperation', 'backupOperation')
}

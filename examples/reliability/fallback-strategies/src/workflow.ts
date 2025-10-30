import { createFlow, type NodeContext } from 'flowcraft'

interface WorkflowContext {
	result: string
}

// ============================================================================
// FALLBACK STRATEGIES NODES
// ============================================================================

async function primaryService(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🏠 Calling primary service...')
	// Simulate primary service (50% failure rate)
	if (Math.random() > 0.5) {
		console.log('❌ Primary service failed')
		throw new Error('Primary service unavailable')
	}
	console.log('✅ Primary service responded')
	await context.set('serviceUsed', 'primary')
	await context.set('response', 'Primary service data')
	return { output: 'Primary service called' }
}

async function secondaryService(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🏠 Calling secondary service...')
	// Simulate secondary service (20% failure rate, slower)
	await new Promise((resolve) => setTimeout(resolve, 300))
	if (Math.random() > 0.8) {
		console.log('❌ Secondary service failed')
		throw new Error('Secondary service error')
	}
	console.log('✅ Secondary service responded')
	await context.set('serviceUsed', 'secondary')
	await context.set('response', 'Secondary service data')
	return { output: 'Secondary service called' }
}

async function tertiaryService(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🏠 Calling tertiary service...')
	// Simulate tertiary service (10% failure rate, slowest)
	await new Promise((resolve) => setTimeout(resolve, 500))
	if (Math.random() > 0.9) {
		console.log('❌ Tertiary service failed')
		throw new Error('Tertiary service error')
	}
	console.log('✅ Tertiary service responded')
	await context.set('serviceUsed', 'tertiary')
	await context.set('response', 'Tertiary service data')
	return { output: 'Tertiary service called' }
}

async function processResponse(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('⚙️ Processing response...')
	const serviceUsed = await context.get('serviceUsed')
	const response = await context.get('response')
	console.log(`⚙️ Processing data from ${serviceUsed}: ${response}`)
	await context.set('processed', true)
	return { output: 'Response processed' }
}

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

/** Creates a workflow with cascading fallback strategy */
export function createCascadingFallbackWorkflow() {
	return createFlow<WorkflowContext>('cascading-fallback-workflow')
		.node('primaryService', primaryService)
		.node('secondaryService', secondaryService)
		.node('tertiaryService', tertiaryService)
		.node('processResponse', processResponse)
		.edge('primaryService', 'secondaryService')
		.edge('secondaryService', 'tertiaryService')
		.edge('tertiaryService', 'processResponse')
}

/** Creates a workflow with parallel fallback strategy */
export function createParallelFallbackWorkflow() {
	return createFlow<WorkflowContext>('parallel-fallback-workflow')
		.node('primaryService', primaryService)
		.node('secondaryService', secondaryService)
		.node('processResponse', processResponse)
		.edge('primaryService', 'processResponse')
		.edge('secondaryService', 'processResponse')
}

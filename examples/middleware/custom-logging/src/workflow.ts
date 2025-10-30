import { createFlow, type NodeContext } from 'flowcraft'

interface WorkflowContext {
	data: { items: number[] }
	processedData: number[]
}

// ============================================================================
// BASIC LOGGING NODES
// ============================================================================

async function prepareData(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('📦 Preparing data for processing...')
	await context.set('data', { items: [1, 2, 3] })
	return { output: 'Data prepared' }
}

async function processData(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('⚙ Processing data...')
	const data = await context.get('data')
	// Simulate processing time
	await new Promise((resolve) => setTimeout(resolve, 10))
	const processed = data?.items.map((item: number) => item * 2)
	await context.set('processedData', processed)
	console.log('⚙ Data processed')
	return { output: 'Data processed' }
}

async function finalize(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('✅ Finalizing workflow...')
	const processed = await context.get('processedData')
	console.log(`✅ Finalized with ${processed?.length} items`)
	return { output: 'Workflow finalized' }
}

// ============================================================================
// ERROR LOGGING NODES
// ============================================================================

async function failingNode(): Promise<{ output: string }> {
	console.log('💥 Simulating failure...')
	throw new Error('Simulated error')
}

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

/** Creates a basic logging workflow */
export function createBasicLoggingWorkflow() {
	return createFlow<WorkflowContext>('basic-logging-demo')
		.node('prepareData', prepareData)
		.node('processData', processData)
		.node('finalize', finalize)
		.edge('prepareData', 'processData')
		.edge('processData', 'finalize')
}

/** Creates a structured logging workflow */
export function createStructuredLoggingWorkflow() {
	return createFlow<WorkflowContext>('structured-logging-demo')
		.node('prepareData', prepareData)
		.node('processData', processData)
		.node('finalize', finalize)
		.edge('prepareData', 'processData')
		.edge('processData', 'finalize')
}

/** Creates an error logging workflow */
export function createErrorLoggingWorkflow() {
	return createFlow<WorkflowContext>('error-logging-demo').node('failingNode', failingNode)
}

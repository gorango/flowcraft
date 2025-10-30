import { createFlow, type NodeContext } from 'flowcraft'

interface WorkflowContext {
	data: { records: { id: number; value: number }[] }
	processedData: { id: number; value: number; processedValue: number }[]
	validated: boolean
	report: { totalRecords: number; averageValue: number; timestamp: string }
}

// ============================================================================
// PERFORMANCE TUNING NODES
// ============================================================================

async function loadData(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('📥 Loading data from external source...')
	// Simulate slow I/O
	await new Promise((resolve) => setTimeout(resolve, 100))
	const data = { records: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: Math.random() })) }
	await context.set('data', data)
	return { output: 'Data loaded' }
}

async function processBatch(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('⚙️ Processing data batch...')
	const data = await context.get('data')
	// Simulate CPU intensive work
	const processed = data?.records.map((record: any) => ({
		...record,
		processedValue: record.value * 2,
	}))
	await new Promise((resolve) => setTimeout(resolve, 50))
	await context.set('processedData', processed)
	return { output: 'Batch processed' }
}

async function validateResults(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('✅ Validating results...')
	const processedData = await context.get('processedData')
	// Simulate validation
	const valid = processedData?.every((record: any) => record.processedValue > 0)
	if (!valid) {
		throw new Error('Validation failed')
	}
	await new Promise((resolve) => setTimeout(resolve, 20))
	await context.set('validated', true)
	return { output: 'Results validated' }
}

async function generateReport(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('📊 Generating performance report...')
	const processedData = await context.get('processedData')
	if (!processedData) throw new Error('Invalid processed data')
	const report = {
		totalRecords: processedData.length,
		averageValue: processedData.reduce((sum: number, r: any) => sum + r.processedValue, 0) / processedData.length,
		timestamp: new Date().toISOString(),
	}
	await new Promise((resolve) => setTimeout(resolve, 30))
	await context.set('report', report)
	return { output: 'Report generated' }
}

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

/** Creates a performance-tuned workflow */
export function createPerformanceTunedWorkflow() {
	return createFlow<WorkflowContext>('performance-tuned-workflow')
		.node('loadData', loadData)
		.node('processBatch', processBatch)
		.node('validateResults', validateResults)
		.node('generateReport', generateReport)
		.edge('loadData', 'processBatch')
		.edge('processBatch', 'validateResults')
		.edge('validateResults', 'generateReport')
}

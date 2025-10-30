import { createFlow, type NodeContext } from 'flowcraft'

interface WorkflowContext {
	batchItems: { id: number; name: string; value: number }[]
	batchResults: { id: number; name: string; value: number; processed: boolean }[]
	loopData: { items: number[]; currentIndex: number; counter: number; results: number[]; maxIterations: number }
	loopResults: number[]
	waitCompleted: boolean
	mainData: { message: string; timestamp: string }
	validatedData: { message: string; timestamp: string; valid: boolean }
	enrichedData: { message: string; timestamp: string; valid: boolean; enriched: boolean }
	subflowResult: any
	validationResults: any
	inputData: any
	finalResult: any
}

// ============================================================================
// BATCH PROCESSING NODES
// ============================================================================

// Node that prepares data for batch processing
async function prepareBatchData(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('📦 [Prepare] Preparing data for batch processing...')

	// Create sample data for batch processing
	const items = [
		{ id: 1, name: 'Item A', value: 10 },
		{ id: 2, name: 'Item B', value: 20 },
		{ id: 3, name: 'Item C', value: 30 },
		{ id: 4, name: 'Item D', value: 40 },
		{ id: 5, name: 'Item E', value: 50 },
	]

	await context.set('batchItems', items)
	console.log(`📦 Prepared ${items.length} items for batch processing`)

	return { output: `Prepared ${items.length} items` }
}

// Node that processes individual batch items
async function processBatchItem(ctx: NodeContext<WorkflowContext, any, { id: number; name: string; value: number }>) {
	const { input } = ctx
	console.log('⚙️ [Process Item] Processing batch item...')

	const item = input // This comes from the batch-scatter node
	if (!item) throw new Error('Invalid input')
	console.log(`   Processing: ${item.name} (ID: ${item.id})`)

	// Simulate processing time and add metadata
	const processedItem = {
		...item,
		processed: true,
		processedAt: new Date().toISOString(),
		status: item.value > 25 ? 'high-value' : 'standard',
		metadata: {
			processor: 'batch-processor-v1',
			quality: item.value > 35 ? 'premium' : 'standard',
		},
	}

	console.log(`   ✅ Completed: ${processedItem.name} - ${processedItem.status}`)
	return { output: processedItem }
}

// Node that aggregates batch results
async function aggregateBatchResults(ctx: NodeContext<WorkflowContext>) {
	const { context, input } = ctx
	console.log('📊 [Aggregate] Aggregating batch results...')

	const results = input // This comes from the batch-gather node
	console.log(`   Received ${results.length} processed items`)

	// Calculate statistics
	const stats = {
		totalItems: results.length,
		highValueItems: results.filter((item: any) => item.status === 'high-value').length,
		totalValue: results.reduce((sum: number, item: any) => sum + item.value, 0),
		premiumItems: results.filter((item: any) => item.metadata.quality === 'premium').length,
		processingTime: new Date().toISOString(),
	}

	await context.set('batchStats', stats)
	await context.set('processedItems', results)

	console.log(`📊 Aggregation complete: ${stats.totalItems} items, ${stats.highValueItems} high-value`)
	return { output: `Processed ${stats.totalItems} items` }
}

// ============================================================================
// LOOP NODES
// ============================================================================

// Node that sets up data for looping
async function setupLoopData(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🔄 [Setup Loop] Setting up data for loop demonstration...')

	const loopData = {
		counter: 0,
		maxIterations: 5,
		results: [] as string[],
		startTime: new Date().toISOString(),
	}

	await context.set('loopData', loopData)
	console.log('🔄 Loop data initialized')

	return { output: 'Loop data ready' }
}

// Node that executes within the loop
async function loopIteration(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🔁 [Loop] Executing loop iteration...')

	const loopData = await context.get('loopData')
	if (!loopData) throw new Error('Invalid loop data')
	const currentCount = loopData.counter + 1

	// Update loop data
	const updatedLoopData = {
		...loopData,
		counter: currentCount,
		results: [...loopData.results, `Iteration ${currentCount} at ${new Date().toISOString()}`],
	}

	await context.set('loopData', updatedLoopData)

	console.log(`🔁 Completed iteration ${currentCount}/${loopData.maxIterations}`)

	// Return whether to continue looping
	return {
		output: `Iteration ${currentCount} complete`,
		action: currentCount >= loopData.maxIterations ? 'break' : 'continue',
	}
}

// Node that processes loop results
async function processLoopResults(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('📈 [Process Loop] Processing loop execution results...')

	const loopData = await context.get('loopData')
	if (!loopData) throw new Error('Invalid loop data')

	console.log(`📈 Loop completed with ${loopData.counter} iterations`)
	console.log('📈 Results:')
	loopData.results.forEach((result, index) => {
		console.log(`   ${index + 1}. ${result}`)
	})

	await context.set('loopSummary', {
		totalIterations: loopData.counter,
		duration: new Date().toISOString(),
		allResults: loopData.results,
	})

	return { output: `Loop completed with ${loopData.counter} iterations` }
}

// ============================================================================
// WAIT/SLEEP NODES
// ============================================================================

// Node that demonstrates waiting
async function demonstrateWaiting(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('⏳ [Wait Demo] Demonstrating wait functionality...')

	const waitStart = new Date()
	await context.set('waitStart', waitStart.toISOString())

	console.log('⏳ Initiated wait sequence...')

	return { output: 'Wait sequence initiated' }
}

// Node that simulates waiting
async function waitNode() {
	console.log('⏰ [Wait] Waiting for 1 second...')

	await new Promise((resolve) => setTimeout(resolve, 1000))

	console.log('⏰ [Wait] Wait completed')

	return { output: 'waited' }
}

// Node that processes after waiting
async function processAfterWait(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('⏰ [After Wait] Processing after wait completion...')

	const waitStart = await context.get('waitStart')
	const waitEnd = new Date()

	const waitDuration = waitEnd.getTime() - new Date(waitStart).getTime()

	console.log(`⏰ Wait completed after ${waitDuration}ms`)

	await context.set('waitResults', {
		startTime: waitStart,
		endTime: waitEnd.toISOString(),
		durationMs: waitDuration,
	})

	return { output: `Waited for ${waitDuration}ms` }
}

// ============================================================================
// SUBFLOW NODES
// ============================================================================

// Main workflow that will call subflows
async function mainWorkflowStart(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🚀 [Main] Starting main workflow with subflows...')

	await context.set('mainWorkflowData', {
		startedAt: new Date().toISOString(),
		subflows: [] as string[],
	})

	return { output: 'Main workflow started' }
}

// Subflow functions
async function validateData(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('✅ [Subflow 1] Validating input data...')
	const data = await context.get('inputData')

	if (!data || !data.name) {
		throw new Error('Invalid input: missing name')
	}

	const completeness = {
		hasName: !!data.name,
		hasEmail: !!data.email,
		hasAge: !!data.age,
		score: [data.name, data.email, data.age].filter(Boolean).length,
	}

	return { output: completeness }
}

async function enrichData(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🏷️ [Subflow 2] Enriching data...')
	const data = await context.get('inputData')

	const enriched = {
		...data,
		metadata: {
			processedAt: new Date().toISOString(),
			version: '1.0',
			source: 'enrichment-subflow',
		},
		insights: {
			ageGroup: data.age < 25 ? 'young' : data.age < 50 ? 'adult' : 'senior',
			nameLength: data.name.length,
			emailDomain: data.email.split('@')[1],
			processed: true,
		},
	}

	return { output: enriched }
}

// Subflow 1: Data validation
export const createValidationSubflow = () =>
	createFlow<WorkflowContext>('validation-subflow').node('validate', validateData)

// Subflow 2: Data enrichment
export const createEnrichmentSubflow = () =>
	createFlow<WorkflowContext>('enrichment-subflow').node('enrich', enrichData)

// Node that processes subflow results
async function processSubflowResults(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🎯 [Main] Processing subflow results...')

	const validationResults = await context.get('validationResults')
	const enrichedData = await context.get('enrichedData')

	const finalResult = {
		originalData: await context.get('inputData'),
		validation: validationResults,
		enriched: enrichedData,
		completedAt: new Date().toISOString(),
	}

	await context.set('finalResult', finalResult)

	console.log('🎯 Subflow processing complete')
	return { output: 'All subflows completed' }
}

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

// Batch processing workflow
export function createBatchProcessingWorkflow() {
	return createFlow<WorkflowContext>('batch-processing-demo')
		.node('prepareData', prepareBatchData)
		.batch('processItems', processBatchItem, {
			inputKey: 'batchItems',
			outputKey: 'processedItems',
		})
		.node('aggregateResults', aggregateBatchResults)
		.edge('prepareData', 'processItems')
		.edge('processItems', 'aggregateResults')
}

// Loop processing workflow
export function createLoopProcessingWorkflow() {
	return createFlow<WorkflowContext>('loop-processing-demo')
		.node('setupLoop', setupLoopData)
		.node('executeIteration', loopIteration)
		.node('processResults', processLoopResults)
		.loop('counterLoop', {
			startNodeId: 'executeIteration',
			endNodeId: 'executeIteration',
			condition: 'loopData.counter < loopData.maxIterations',
		})
		.edge('setupLoop', 'executeIteration')
		.edge('executeIteration', 'processResults')
}

// Wait/Sleep workflow
export function createWaitWorkflow() {
	return createFlow<WorkflowContext>('wait-sleep-demo')
		.node('startWait', demonstrateWaiting)
		.node('wait5Seconds', waitNode)
		.node('processAfterWait', processAfterWait)
		.edge('startWait', 'wait5Seconds')
		.edge('wait5Seconds', 'processAfterWait')
}

// Subflow workflow
export function createSubflowWorkflow() {
	const validationBlueprint = createValidationSubflow().toBlueprint()
	const enrichmentBlueprint = createEnrichmentSubflow().toBlueprint()

	const flow = createFlow<WorkflowContext>('subflow-demo')
		.node('startMain', mainWorkflowStart)
		.node('processResults', processSubflowResults)
		.edge('startMain', 'validationSubflow')
		.edge('startMain', 'enrichmentSubflow')
		.edge('validationSubflow', 'processResults')
		.edge('enrichmentSubflow', 'processResults')

	const blueprint = flow.toBlueprint()

	// Manually add subflow nodes
	blueprint.nodes?.push({
		id: 'validationSubflow',
		uses: 'subflow',
		params: {
			blueprintId: validationBlueprint.id,
			inputs: { inputData: 'inputData' },
			outputs: { validationResults: 'validate' },
		},
	})
	blueprint.nodes?.push({
		id: 'enrichmentSubflow',
		uses: 'subflow',
		params: {
			blueprintId: enrichmentBlueprint.id,
			inputs: { inputData: 'inputData' },
			outputs: { enrichedData: 'enrich' },
		},
	})

	return { blueprint, functionRegistry: flow.getFunctionRegistry() }
}

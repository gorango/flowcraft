import { createFlow, type NodeContext } from 'flowcraft'

interface WorkflowContext {
	input?: any
	validated?: boolean
	workflowData?: any
	dataSource?: string
	transformedData?: any
	accumulatedAt?: string
	steps?: string[]
	summary?: any
	finalResult?: any
	intermediateData?: any
	cleanOutput?: any
	nestedData?: any
	queryResults?: any
}

// ============================================================================
// CONTEXT MANAGEMENT PATTERNS
// ============================================================================

// Node that demonstrates reading from context
async function readInitialData(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('📖 [Read] Reading initial workflow data...')

	// Read the initial input data
	const inputData = await context.get('input')
	console.log(`📖 Initial data: ${JSON.stringify(inputData)}`)

	// Store it in a more accessible location
	await context.set('workflowData', inputData)

	return { output: 'Data read successfully' }
}

// Node that demonstrates conditional context access
async function checkExistingData(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🔍 [Conditional] Checking for existing data...')

	// Check if data already exists
	const existingData = await context.get('existingData')

	if (existingData) {
		console.log('🔍 Found existing data, skipping initialization')
		await context.set('dataSource', 'existing')
		return { output: 'Using existing data' }
	} else {
		console.log('🔍 No existing data found, will initialize')
		await context.set('dataSource', 'new')
		return { output: 'Need to initialize data' }
	}
}

// Node that demonstrates context updates and transformations
async function transformData(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🔄 [Transform] Transforming workflow data...')

	const workflowData = await context.get('workflowData')
	const dataSource = await context.get('dataSource')

	// Transform the data based on source
	const transformedData = {
		...workflowData,
		source: dataSource,
		transformedAt: new Date().toISOString(),
		processed: true,
		metadata: {
			version: '1.0',
			transformer: 'context-state-management-example',
		},
	}

	// Update context with transformed data
	await context.set('transformedData', transformedData)

	console.log(`🔄 Data transformed from ${dataSource} source`)
	return { output: `Transformed data from ${dataSource}` }
}

// Node that demonstrates context merging and accumulation
async function accumulateResults(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('📊 [Accumulate] Accumulating workflow results...')

	// Read multiple context values
	const workflowData = await context.get('workflowData')
	const transformedData = await context.get('transformedData')
	const dataSource = await context.get('dataSource')

	// Create an accumulated result
	const accumulatedResult = {
		original: workflowData,
		transformed: transformedData,
		source: dataSource,
		accumulatedAt: new Date().toISOString(),
		steps: ['read', 'check', 'transform', 'accumulate'],
		summary: {
			totalSteps: 4,
			dataProcessed: true,
			sourceType: dataSource,
		},
	}

	await context.set('finalResult', accumulatedResult)

	console.log(`📊 Accumulated results from ${dataSource} data source`)
	return { output: 'Results accumulated successfully' }
}

// Node that demonstrates context cleanup and finalization
async function finalizeContext(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🧹 [Finalize] Finalizing and cleaning up context...')

	const finalResult = await context.get('finalResult')

	// Create a clean final output
	const cleanOutput = {
		id: finalResult.original.id,
		name: finalResult.original.name,
		status: 'completed',
		processedAt: finalResult.accumulatedAt,
		source: finalResult.source,
		stepsCompleted: finalResult.steps.length,
	}

	// Clean up intermediate data (optional - context persists)
	await context.set('intermediateData', null) // Mark for cleanup

	await context.set('cleanOutput', cleanOutput)

	console.log('🧹 Context finalized and cleaned up')
	return { output: 'Context finalized' }
}

// ============================================================================
// ADVANCED CONTEXT PATTERNS
// ============================================================================

// Node demonstrating nested context structures
async function createNestedStructure(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🏗️ [Nested] Creating nested context structures...')

	// Create nested data structures
	const nestedData = {
		user: {
			profile: {
				basic: { name: 'John', email: 'john@example.com' },
				preferences: { theme: 'dark', notifications: true },
			},
			activity: {
				lastLogin: new Date().toISOString(),
				sessionCount: 5,
			},
		},
		system: {
			version: '1.0.0',
			environment: 'development',
		},
	}

	await context.set('nestedData', nestedData)

	console.log('🏗️ Nested context structure created')
	return { output: 'Nested structure created' }
}

// Node demonstrating context queries and deep access
async function queryNestedData(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🔎 [Query] Querying nested context data...')

	const nestedData = await context.get('nestedData')

	// Deep access patterns
	const userName = nestedData.user.profile.basic.name
	const theme = nestedData.user.profile.preferences.theme
	const version = nestedData.system.version

	// Create query results
	const queryResults = {
		userName,
		userTheme: theme,
		systemVersion: version,
		queryTimestamp: new Date().toISOString(),
		accessedPaths: [
			'nestedData.user.profile.basic.name',
			'nestedData.user.profile.preferences.theme',
			'nestedData.system.version',
		],
	}

	await context.set('queryResults', queryResults)

	console.log(`🔎 Queried data for user: ${userName}`)
	return { output: `Queried ${queryResults.accessedPaths.length} data paths` }
}

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

// Basic context management workflow
export function createBasicContextWorkflow() {
	return createFlow<WorkflowContext>('basic-context-management')
		.node('readData', readInitialData)
		.node('checkData', checkExistingData)
		.node('transformData', transformData)
		.node('accumulateResults', accumulateResults)
		.node('finalizeContext', finalizeContext)
		.edge('readData', 'checkData')
		.edge('checkData', 'transformData')
		.edge('transformData', 'accumulateResults')
		.edge('accumulateResults', 'finalizeContext')
}

// Advanced context patterns workflow
export function createAdvancedContextWorkflow() {
	return createFlow<WorkflowContext>('advanced-context-patterns')
		.node('createNested', createNestedStructure)
		.node('queryNested', queryNestedData)
		.edge('createNested', 'queryNested')
}

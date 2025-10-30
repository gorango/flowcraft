import { createFlow, type NodeContext } from 'flowcraft'

interface WorkflowContext {
	debugMode: boolean
	stepCount: number
	currentStep: number
	condition: boolean
	result: any
}

// ============================================================================
// INTERACTIVE DEBUGGING NODES
// ============================================================================

async function initializeDebug(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🐛 Initializing debug session...')
	await context.set('debugMode', true)
	await context.set('stepCount', 0)
	return { output: 'Debug initialized' }
}

async function processStep(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('⚙️ Processing step...')
	const stepCount = (await context.get('stepCount')) || 0
	await context.set('stepCount', stepCount + 1)
	await context.set('currentStep', `step_${stepCount + 1}`)
	return { output: `Step ${stepCount + 1} processed` }
}

async function checkCondition(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🔍 Checking condition...')
	const stepCount = (await context.get('stepCount')) || 0
	const shouldContinue = stepCount < 3
	await context.set('shouldContinue', shouldContinue)
	return { output: shouldContinue ? 'Continue' : 'Stop' }
}

async function finalizeDebug(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🏁 Finalizing debug session...')
	const stepCount = (await context.get('stepCount')) || 0
	await context.set('finalStepCount', stepCount)
	return { output: 'Debug finalized' }
}

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

/** Creates an interactive debugging workflow */
export function createInteractiveDebuggingWorkflow() {
	return createFlow<WorkflowContext>('interactive-debugging-workflow')
		.node('initializeDebug', initializeDebug)
		.node('processStep', processStep)
		.node('checkCondition', checkCondition)
		.node('finalizeDebug', finalizeDebug)
		.edge('initializeDebug', 'processStep')
		.edge('processStep', 'checkCondition')
		.edge('checkCondition', 'finalizeDebug')
}

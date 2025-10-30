import { createFlow, type NodeContext } from 'flowcraft'
import { createInterface } from 'node:readline'

interface WorkflowContext {
	task: { id: string; description: string; amount: number; reason: string }
	status: string
	approved: boolean
	reviewer: string
	reviewTimestamp: string
	executed: boolean
	executionTimestamp: string
	handled: boolean
}

// ============================================================================
// HUMAN-IN-THE-LOOP NODES
// ============================================================================

async function promptUserApproval(task: {
	id: string
	description: string
	amount: number
	reason: string
}): Promise<boolean> {
	return new Promise((resolve) => {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
		})

		console.log('\n🤔 HUMAN REVIEW REQUIRED')
		console.log('='.repeat(50))
		console.log(`Task ID: ${task.id}`)
		console.log(`Description: ${task.description}`)
		console.log(`Amount: $${task.amount}`)
		console.log(`Reason: ${task.reason}`)
		console.log('='.repeat(50))

		rl.question('Approve this request? (y/n): ', (answer) => {
			rl.close()
			const approved = answer.toLowerCase().startsWith('y')
			console.log(`📝 Decision: ${approved ? 'APPROVED' : 'REJECTED'}\n`)
			resolve(approved)
		})
	})
}

async function prepareTask(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('📋 Preparing task for human review...')
	await context.set('task', {
		id: 'task_123',
		description: 'Process customer refund request',
		amount: 99.99,
		reason: 'Product defect',
	})
	await context.set('status', 'prepared')
	return { output: 'Task prepared' }
}

async function humanReview(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('👤 Human review required...')
	const task = await context.get('task')
	if (!task) throw new Error('Invalid task')

	// Get actual human decision via terminal input
	const approved = await promptUserApproval(task)

	await context.set('approved', approved)
	await context.set('reviewer', 'interactive.user@terminal')
	await context.set('reviewTimestamp', new Date().toISOString())

	return { output: approved ? 'Approved' : 'Rejected' }
}

async function executeApprovedTask(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('⚡ Executing approved task...')

	const task = await context.get('task')
	if (!task) throw new Error('Invalid task')

	const approved = await context.get('approved')
	if (!approved) throw new Error('Task not approved')

	// Simulate execution
	console.log(`⚡ Processing refund for $${task.amount}`)
	await context.set('executed', true)
	await context.set('executionTimestamp', new Date().toISOString())

	return { output: 'Task executed' }
}

async function handleRejection(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('📝 Handling rejected task...')
	const task = await context.get('task')
	if (!task) throw new Error('Invalid task')
	console.log(`📝 Task ${task.id} was rejected, notifying customer...`)
	await context.set('handled', true)
	return { output: 'Rejection handled' }
}

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

/** Creates a human-in-the-loop workflow */
export function createHITLWorkflow() {
	return createFlow<WorkflowContext>('hitl-workflow')
		.node('prepareTask', prepareTask)
		.node('humanReview', humanReview)
		.node('executeApprovedTask', executeApprovedTask)
		.node('handleRejection', handleRejection)
		.edge('prepareTask', 'humanReview')
		.edge('humanReview', 'executeApprovedTask')
		.edge('humanReview', 'handleRejection')
}

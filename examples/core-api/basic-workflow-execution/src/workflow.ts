import { createFlow, type NodeContext } from 'flowcraft'

export interface WorkflowContext {
	user: { name: string; email: string }
	processedUser: { name: string; email: string; processedAt: string; status: string }
}

// ============================================================================
// USER PROCESSING NODES
// ============================================================================

async function validateUser(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🔍 Validating user data...')

	// Get user data from context
	const user = await context.get('user')
	if (!user?.name) {
		throw new Error('Invalid user: missing name')
	}

	console.log(`✅ User ${user.name} validated`)
	return { output: 'User validated successfully' }
}
async function processUser(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('⚙️ Processing user...')

	const user = await context.get('user')
	const processedUser = {
		...user,
		processedAt: new Date().toISOString(),
		status: 'processed',
	}

	// Store processed user in context
	await context.set('processedUser', processedUser)

	console.log(`✅ User ${user?.name} processed`)
	return { output: `Processed user: ${user?.name}` }
}
async function sendNotification(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('📧 Sending notification...')

	const processedUser = await context.get('processedUser')

	// Simulate sending a notification
	console.log(`📧 Notification sent to ${processedUser?.email}: "Welcome ${processedUser?.name}!"`)

	return { output: 'Notification sent successfully' }
}

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

// Define a simple user processing workflow
export function createUserProcessingWorkflow() {
	return createFlow<WorkflowContext>('user-processing-workflow')
		.node('validateUser', validateUser)
		.node('processUser', processUser)
		.node('sendNotification', sendNotification)
		.edge('validateUser', 'processUser')
		.edge('processUser', 'sendNotification')
}

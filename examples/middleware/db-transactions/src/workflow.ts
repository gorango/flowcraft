import { createFlow, type NodeContext } from 'flowcraft'

interface WorkflowContext {
	transactionId: string
	userId: number
	userUpdated: boolean
}

// ============================================================================
// DATABASE TRANSACTION NODES
// ============================================================================

async function beginTransaction(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🔄 Beginning database transaction...')
	await context.set('transactionId', `txn_${Date.now()}`)
	return { output: 'Transaction begun' }
}

async function insertUser(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('📝 Inserting user data...')
	const _transactionId = await context.get('transactionId')
	// Simulate insert
	await new Promise((resolve) => setTimeout(resolve, 5))
	await context.set('userId', 123)
	console.log('📝 User inserted')
	return { output: 'User inserted' }
}

async function updateUser(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🔄 Updating user data...')
	const _transactionId = await context.get('transactionId')
	const _userId = await context.get('userId')
	// Simulate update
	await new Promise((resolve) => setTimeout(resolve, 5))
	await context.set('userUpdated', true)
	console.log('🔄 User updated')
	return { output: 'User updated' }
}

async function commitTransaction(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('✅ Committing transaction...')
	const _transactionId = await context.get('transactionId')
	// Simulate commit
	await new Promise((resolve) => setTimeout(resolve, 2))
	console.log('✅ Transaction committed')
	return { output: 'Transaction committed' }
}

async function failingOperation(): Promise<{ output: string }> {
	console.log('💥 Simulating database error...')
	throw new Error('Database constraint violation')
}

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

/** Creates a successful database transaction workflow */
export function createSuccessfulTransactionWorkflow() {
	return createFlow<WorkflowContext>('successful-db-transaction')
		.node('beginTransaction', beginTransaction)
		.node('insertUser', insertUser)
		.node('updateUser', updateUser)
		.node('commitTransaction', commitTransaction)
		.edge('beginTransaction', 'insertUser')
		.edge('insertUser', 'updateUser')
		.edge('updateUser', 'commitTransaction')
}

/** Creates a failing database transaction workflow */
export function createFailingTransactionWorkflow() {
	return createFlow<WorkflowContext>('failing-db-transaction')
		.node('beginTransaction', beginTransaction)
		.node('insertUser', insertUser)
		.node('failingOperation', failingOperation)
		.edge('beginTransaction', 'insertUser')
		.edge('insertUser', 'failingOperation')
}

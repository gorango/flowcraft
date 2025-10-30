import { BaseNode, createFlow, type NodeContext } from 'flowcraft'

interface WorkflowContext {
	user: { name: string; email: string; age?: number; preferences?: string[] }
	userScore: number
	enrichedUser: any
	notificationsSent: number
}

// ============================================================================
// FUNCTION-BASED NODES
// ============================================================================

// Simple function-based node
async function validateEmail(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🔍 [Function] Validating email...')

	const user = await context.get('user')
	const email = user?.email

	// Simple email validation
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
	if (!email || !emailRegex.test(email)) {
		throw new Error(`Invalid email format: ${email}`)
	}

	console.log(`✅ [Function] Email ${email} is valid`)
	return { output: 'Email validated' }
}

// Function-based node with complex logic
async function calculateUserScore(ctx: NodeContext<WorkflowContext>) {
	const { context } = ctx
	console.log('🧮 [Function] Calculating user score...')

	const user = await context.get('user')
	let score = 0

	// Scoring logic based on user attributes
	if (user?.name && user.name.length > 0) score += 10
	if (user?.email) score += 15
	if (user?.age && user.age >= 18) score += 20
	if (user?.preferences && user.preferences.length > 0) score += 5

	const finalScore = Math.min(score, 100) // Cap at 100

	await context.set('userScore', finalScore)
	console.log(`✅ [Function] User score calculated: ${finalScore}/100`)

	return { output: `Score: ${finalScore}` }
}

// ============================================================================
// CLASS-BASED NODES
// ============================================================================

// Basic class-based node extending BaseNode
class UserProfileEnricher extends BaseNode {
	async exec(_prepResult: any, context: any) {
		console.log('🎨 [Class] Enriching user profile...')

		const user = await context.context.get('user')
		const score = await context.context.get('userScore')

		// Enrich user profile based on score
		const enrichedUser = {
			...user,
			score,
			level: score >= 80 ? 'Premium' : score >= 50 ? 'Standard' : 'Basic',
			badges: [] as string[],
		}

		// Add badges based on criteria
		if (score >= 80) enrichedUser.badges.push('Top Scorer')
		if (user.age >= 25) enrichedUser.badges.push('Experienced')
		if (user.preferences?.includes('tech')) enrichedUser.badges.push('Tech Enthusiast')

		await context.context.set('enrichedUser', enrichedUser)

		console.log(`✅ [Class] Profile enriched with level: ${enrichedUser.level}`)
		return { output: `Enriched profile: ${enrichedUser.level} level` }
	}
}

// Class-based node with lifecycle methods
class NotificationSender extends BaseNode {
	private sentNotifications: string[] = []

	async prep(context: any) {
		console.log('📧 [Class] Preparing notification sender...')
		// Could initialize connections, load templates, etc.
		this.sentNotifications = []
		return context.input
	}

	async exec(_prepResult: any, context: any) {
		console.log('📧 [Class] Sending notifications...')

		const enrichedUser = await context.context.get('enrichedUser')

		// Send welcome notification
		const welcomeMessage = `Welcome ${enrichedUser.name}! You're a ${enrichedUser.level} member.`
		this.sentNotifications.push(`Welcome: ${welcomeMessage}`)

		// Send badge notifications
		if (enrichedUser.badges.length > 0) {
			const badgeMessage = `You've earned badges: ${enrichedUser.badges.join(', ')}`
			this.sentNotifications.push(`Badges: ${badgeMessage}`)
		}

		// Simulate sending notifications
		for (const notification of this.sentNotifications) {
			console.log(`📤 ${notification}`)
		}

		await context.context.set('notificationsSent', this.sentNotifications.length)

		console.log(`✅ [Class] Sent ${this.sentNotifications.length} notifications`)
		return { output: `Sent ${this.sentNotifications.length} notifications` }
	}

	async post(execResult: any) {
		console.log('📧 [Class] Cleaning up notification sender...')
		// Could close connections, log metrics, etc.
		console.log(`📊 Total notifications sent in this execution: ${this.sentNotifications.length}`)
		return execResult
	}
}

// ============================================================================
// WORKFLOW DEFINITION
// ============================================================================

export function createFunctionClassWorkflow() {
	return (
		createFlow<WorkflowContext>('function-class-nodes-demo')
			// Function-based nodes
			.node('validateEmail', validateEmail)
			.node('calculateUserScore', calculateUserScore)
			// Class-based nodes
			.node('enrichProfile', UserProfileEnricher)
			.node('sendNotifications', NotificationSender)
			// Define execution flow
			.edge('validateEmail', 'calculateUserScore')
			.edge('calculateUserScore', 'enrichProfile')
			.edge('enrichProfile', 'sendNotifications')
	)
}

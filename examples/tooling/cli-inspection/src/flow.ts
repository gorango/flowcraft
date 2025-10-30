import { createFlow } from 'flowcraft'

// Define the Context Interface
interface GreetingWorkflowContext {
	user_id?: number
	user_name?: string
	final_greeting?: string
}

// Define the Node Logic
async function fetchUser() {
	console.log('Fetching user...')
	await new Promise((resolve) => setTimeout(resolve, 500))
	return { output: { id: 1, name: 'Alice' } }
}

async function extractName(ctx: any) {
	const input = ctx.input as { name: string }
	console.log('Extracting name...')
	// Store the name in context for later use
	await ctx.context.set('user_name', input.name)
	return { output: input.name }
}

async function createGreeting(ctx: any) {
	const input = ctx.input as string
	console.log('Creating greeting...')
	const greeting = `Hello, ${input}!`
	// Store the final greeting in context
	await ctx.context.set('final_greeting', greeting)
	return { output: greeting }
}

// Define the Workflow
export function createGreetingFlow() {
	return (
		createFlow<GreetingWorkflowContext>('greeting-workflow')
			.node('fetch-user', fetchUser)
			.node('extract-name', extractName)
			.node('create-greeting', createGreeting)
			// Define the execution order
			.edge('fetch-user', 'extract-name')
			.edge('extract-name', 'create-greeting')
	)
}

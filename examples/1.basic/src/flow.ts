import { createFlow } from 'flowcraft'

// --- 1. Define the Node Logic ---

// Node to simulate fetching a user
async function fetchUser() {
	console.log('Fetching user...')
	return { output: { id: 1, name: 'Alice' } }
}

// Node to extract the user's name
async function extractName(ctx: any) {
	const input = ctx.input as { name: string }
	console.log('Extracting name...')
	return { output: input.name }
}

// Node to create a greeting
async function createGreeting(ctx: any) {
	const input = ctx.input as string
	console.log('Creating greeting...')
	return { output: `Hello, ${input}!` }
}

// --- 2. Define the Workflow ---

export function createGreetingFlow() {
	return createFlow('greeting-workflow')
		.node('fetch-user', fetchUser)
		.node('extract-name', extractName)
		.node('create-greeting', createGreeting)
		// Define the execution order
		.edge('fetch-user', 'extract-name')
		.edge('extract-name', 'create-greeting')
}

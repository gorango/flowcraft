import { createFlow } from 'flowcraft'

// --- Define the Node Logic ---

async function fetchUser() {
	console.log('Fetching user...')
	return { output: { id: 1, name: 'Alice' } }
}

async function extractName(ctx: any) {
	const input = ctx.input as { name: string }
	console.log('Extracting name...')
	return { output: input.name }
}

async function createGreeting(ctx: any) {
	const input = ctx.input as string
	console.log('Creating greeting...')
	return { output: `Hello, ${input}!` }
}

// --- Define the Workflow ---

export function createGreetingFlow() {
	return (
		createFlow('greeting-workflow')
			.node('fetch-user', fetchUser)
			.node('extract-name', extractName)
			.node('create-greeting', createGreeting)
			// Define the execution order
			.edge('fetch-user', 'extract-name')
			.edge('extract-name', 'create-greeting')
	)
}

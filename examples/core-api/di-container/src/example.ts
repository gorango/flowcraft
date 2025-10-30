import { ConsoleLogger, createDefaultContainer, createFlow, FlowRuntime } from 'flowcraft'

// Example node functions
async function validateUser({ context }: any) {
	// Get input from initial context
	const user = await context.get('user')
	console.log('Validating user:', user)
	// Simulate validation logic
	if (!user || !user.name) {
		throw new Error('Invalid user data')
	}
	await context.set('validated_user', user)
	return { output: 'User validated successfully' }
}
async function processUser({ context }: any) {
	const user = await context.get('validated_user')
	console.log('Processing user:', user.name)
	// Simulate processing logic
	return { output: `Processed user: ${user.name}` }
}

// Example workflow that uses services
function createUserWorkflow() {
	return createFlow('user-processing')
		.node('validateUser', validateUser)
		.node('processUser', processUser)
		.edge('validateUser', 'processUser')
}

// Node registry
const userRegistry = {
	validateUser,
	processUser,
}

// Example 1: Direct FlowRuntime configuration
export async function runDirectExample() {
	console.log('=== Direct FlowRuntime Configuration ===\n')

	const workflow = createUserWorkflow()
	const blueprint = workflow.toBlueprint()

	// Direct configuration - pass services directly
	const runtime = new FlowRuntime({
		logger: new ConsoleLogger(),
		registry: userRegistry,
	})

	console.log('Running workflow with direct configuration...')
	const result = await runtime.run(
		blueprint,
		{ user: { name: 'Alice', email: 'alice@example.com' } },
		{
			functionRegistry: workflow.getFunctionRegistry(),
		},
	)

	console.log('Result:', result)
	console.log()
}

// Example 2: Container-based FlowRuntime configuration
export async function runContainerExample() {
	console.log('=== Container-Based FlowRuntime Configuration ===\n')

	const workflow = createUserWorkflow()
	const blueprint = workflow.toBlueprint()

	// Container configuration - use createDefaultContainer for services
	// Note: Registry must be passed separately due to current Flowcraft limitation
	const container = createDefaultContainer({
		logger: new ConsoleLogger(),
		registry: userRegistry,
	})

	const runtime = new FlowRuntime(container)

	console.log('Running workflow with container + direct configuration...')
	const result = await runtime.run(
		blueprint,
		{ user: { name: 'Bob', email: 'bob@example.com' } },
		{
			functionRegistry: workflow.getFunctionRegistry(),
		},
	)

	console.log('Result:', result)
	console.log()
}

// Example 3: Service reuse across multiple runtimes
export async function runReuseExample() {
	console.log('=== Service Reuse Across Multiple Runtimes ===\n')

	// Create a shared container with common services
	const sharedContainer = createDefaultContainer({
		logger: new ConsoleLogger(),
		registry: userRegistry,
	})

	// Create multiple runtimes using the same container
	const runtime1 = new FlowRuntime(sharedContainer)
	const runtime2 = new FlowRuntime(sharedContainer)

	const workflow = createUserWorkflow()
	const blueprint = workflow.toBlueprint()

	console.log('Running workflow 1...')
	const result1 = await runtime1.run(
		blueprint,
		{ user: { name: 'Charlie' } },
		{
			functionRegistry: workflow.getFunctionRegistry(),
		},
	)

	console.log('Running workflow 2...')
	const result2 = await runtime2.run(
		blueprint,
		{ user: { name: 'Diana' } },
		{
			functionRegistry: workflow.getFunctionRegistry(),
		},
	)

	console.log('Both workflows completed successfully!')
	console.log('Result 1:', result1.context.validated_user?.name)
	console.log('Result 2:', result2.context.validated_user?.name)
	console.log()
}

// Main example runner
export async function runExample() {
	console.log('=== Flowcraft Container Usage Examples ===\n')

	try {
		await runDirectExample()
		await runContainerExample()
		await runReuseExample()

		console.log('=== All Examples Completed Successfully ===')
	} catch (error) {
		console.error('Example failed:', error)
	}
}

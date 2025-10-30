import type { ILogger } from 'flowcraft'
import { createDefaultContainer, createFlow, FlowRuntime, ServiceTokens } from 'flowcraft'

// Mock vitest functions for demonstration purposes
// In a real test environment, you would import { vi } from 'vitest'
const vi = {
	fn: () => ({
		mockResolvedValue: (_value: any) => ({
			mockResolvedValue: vi.fn(),
			mockRejectedValue: vi.fn(),
			mock: { calls: [] },
		}),
		mockRejectedValue: (_value: any) => ({
			mockResolvedValue: vi.fn(),
			mockRejectedValue: vi.fn(),
			mock: { calls: [] },
		}),
		mock: { calls: [] },
	}),
}

// Mock logger factory for testing
function createMockLogger() {
	const calls: string[] = []
	return {
		debug: (message: string) => calls.push(`DEBUG: ${message}`),
		info: (message: string) => calls.push(`INFO: ${message}`),
		warn: (message: string) => calls.push(`WARN: ${message}`),
		error: (message: string) => calls.push(`ERROR: ${message}`),
		getCalls: () => calls,
	}
}

// Create a workflow that uses external services
function createDataProcessingWorkflow() {
	return createFlow('data-processing')
		.node('fetchData', async ({ context }) => {
			console.log('Fetching data from external service...')
			// In real code, this would call an external API
			const data = await context.get('external_data')
			return { output: data }
		})
		.node('processData', async ({ input, context }) => {
			console.log('Processing data:', input)
			// Simulate processing that logs progress
			await context.set('processed_result', `Processed: ${input}`)
			return { output: `Processed: ${input}` }
		})
		.node('saveResult', async ({ context }) => {
			console.log('Saving result to database...')
			const _result = await context.get('processed_result')
			// In real code, this would save to database
			return { output: 'Data saved successfully' }
		})
		.edge('fetchData', 'processData')
		.edge('processData', 'saveResult')
}

// Registry with external dependencies
const dataRegistry = {
	fetchData: async ({ context }: any) => {
		console.log('Fetching data from external service...')
		const data = await context.get('external_data')
		return { output: data }
	},
	processData: async ({ input, context }: any) => {
		console.log('Processing data:', input)
		await context.set('processed_result', `Processed: ${input}`)
		return { output: `Processed: ${input}` }
	},
	saveResult: async ({ context }: any) => {
		console.log('Saving result to database...')
		const _result = await context.get('processed_result')
		return { output: 'Data saved successfully' }
	},
}

// Mock services for testing
function createMockServices() {
	const mockLogger = createMockLogger()

	const mockRegistry = {
		fetchData: vi.fn().mockResolvedValue({ output: 'mocked-api-data' }),
		processData: vi.fn().mockResolvedValue({ output: 'mocked-processed-data' }),
		saveResult: vi.fn().mockResolvedValue({ output: 'mocked-save-result' }),
	}

	return { mockLogger, mockRegistry }
}

// Example: Testing with mocked services
export async function runTestingDemo() {
	console.log('=== Testing Demo: Mocking Services with Containers ===\n')

	const workflow = createDataProcessingWorkflow()
	const blueprint = workflow.toBlueprint()

	// Create mocks
	const { mockLogger, mockRegistry: _mockRegistry } = createMockServices()

	// Use container to inject mocks (registry passed separately due to Flowcraft limitation)
	const container = createDefaultContainer({
		logger: mockLogger,
	})

	const runtime = new FlowRuntime({
		logger: container.resolve(ServiceTokens.Logger) as ILogger,
		registry: dataRegistry,
	} as any)

	await runtime.run(
		blueprint,
		{ external_data: 'test-input' },
		{
			functionRegistry: workflow.getFunctionRegistry(),
		},
	)

	console.log('Workflow completed!')
	console.log()
}

// Example: Testing with different service configurations
export async function runConfigurationDemo() {
	console.log('=== Configuration Testing Demo ===\n')

	const workflow = createDataProcessingWorkflow()
	const blueprint = workflow.toBlueprint()

	// Test with different logger configurations
	const testCases = [
		{ name: 'Verbose Logger', logger: createMockLogger() },
		{ name: 'Quiet Logger', logger: createMockLogger() },
		{ name: 'Error Only Logger', logger: createMockLogger() },
	]

	for (const testCase of testCases) {
		console.log(`Testing with ${testCase.name}...`)

		const container = createDefaultContainer({
			logger: testCase.logger,
		})

		const runtime = new FlowRuntime({
			logger: container.resolve(ServiceTokens.Logger) as ILogger,
			registry: dataRegistry,
		} as any)

		await runtime.run(
			blueprint,
			{ external_data: `test-data-${testCase.name}` },
			{
				functionRegistry: workflow.getFunctionRegistry(),
			},
		)

		console.log(`  ✓ Completed with ${testCase.name}`)
	}

	console.log('\nContainers make it easy to test different configurations!')
	console.log()
}

export async function runAllTestingDemos() {
	console.log('=== Complete Testing Suite Demo ===\n')

	try {
		await runTestingDemo()
		await runConfigurationDemo()

		console.log('=== All Testing Demos Completed ===')
		console.log('\nKey Takeaways:')
		console.log('• Containers enable easy service mocking for tests')
		console.log('• Different service configurations can be tested easily')
		console.log('• Test verification becomes straightforward with mocks')
	} catch (error) {
		console.error('Testing demo failed:', error)
	}
}

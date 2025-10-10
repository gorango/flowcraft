import type { NodeContext, NodeFunction, NodeRegistry, NodeResult, RuntimeDependencies } from './types'
import { Context } from './context'

/**
 * Mock node that adds a value to the context
 */
export const addValue: NodeFunction = async (context: NodeContext): Promise<NodeResult> => {
	const value = await context.context.get('value') || 1
	const current = await context.context.get('counter') || 0
	await context.context.set('counter', current + value)
	return { output: current + value }
}

/**
 * Mock node that logs to context
 */
export const logToContext: NodeFunction = async (context: NodeContext): Promise<NodeResult> => {
	const message = await context.context.get('message') || 'Hello World'
	const logs = await context.context.get('logs') || []
	await context.context.set('logs', [...logs, message])
	return { output: message }
}

/**
 * Mock node that performs conditional branching
 */
export const conditionalBranch: NodeFunction = async (context: NodeContext): Promise<NodeResult> => {
	const condition = await context.context.get('condition') || false
	return { action: condition ? 'true' : 'false' }
}

/**
 * Mock node that throws an error
 */
export const throwsError: NodeFunction = async (context: NodeContext): Promise<NodeResult> => {
	const shouldThrow = await context.context.get('shouldThrow') || false
	if (shouldThrow) {
		throw new Error('Test error')
	}
	return { output: 'success' }
}

/**
 * Mock node that returns input as output
 */
export const echoNode: NodeFunction = async (context: NodeContext): Promise<NodeResult> => {
	return { output: context.input }
}

/**
 * Mock node that delays execution
 */
export const delayNode: NodeFunction = async (context: NodeContext): Promise<NodeResult> => {
	const delay = await context.context.get('delay') || 100
	await new Promise(resolve => setTimeout(resolve, delay))
	return { output: `delayed ${delay}ms` }
}

/**
 * Mock node that accumulates values
 */
export const accumulatorNode: NodeFunction = async (context: NodeContext): Promise<NodeResult> => {
	const values = await context.context.get('values') || []
	const newValue = context.input
	const updated = [...values, newValue]
	await context.context.set('values', updated)
	return { output: updated }
}

/**
 * Mock node that filters values
 */
export const filterNode: NodeFunction = async (context: NodeContext): Promise<NodeResult> => {
	const values = await context.context.get('values') || []
	const predicate = await context.context.get('predicate') || ((x: any) => x > 0)
	const filtered = values.filter(predicate)
	return { output: filtered }
}

/**
 * Mock node that transforms values
 */
export const transformNode: NodeFunction = async (context: NodeContext): Promise<NodeResult> => {
	const values = await context.context.get('values') || []
	const transform = await context.context.get('transform') || ((x: any) => x * 2)
	const transformed = values.map(transform)
	return { output: transformed }
}

/**
 * Mock node that validates data
 */
export const validatorNode: NodeFunction = async (context: NodeContext): Promise<NodeResult> => {
	const data = context.input
	const schema = await context.context.get('schema') || {}

	// Simple validation - check if required fields exist
	const errors: string[] = []
	for (const [field, required] of Object.entries(schema)) {
		if (required && !data?.[field]) {
			errors.push(`Missing required field: ${field}`)
		}
	}

	if (errors.length > 0) {
		return { error: { message: errors.join(', ') } }
	}

	return { output: data }
}

/**
 * Pre-populated node registry for testing
 */
export const mockNodeRegistry: NodeRegistry = {
	addValue: { implementation: addValue, description: 'Adds a value to counter' },
	logToContext: { implementation: logToContext, description: 'Logs message to context' },
	conditionalBranch: { implementation: conditionalBranch, description: 'Branches based on condition' },
	throwsError: { implementation: throwsError, description: 'Throws an error for testing' },
	echo: { implementation: echoNode, description: 'Returns input as output' },
	delay: { implementation: delayNode, description: 'Delays execution' },
	accumulator: { implementation: accumulatorNode, description: 'Accumulates values' },
	filter: { implementation: filterNode, description: 'Filters values' },
	transform: { implementation: transformNode, description: 'Transforms values' },
	validator: { implementation: validatorNode, description: 'Validates data' },
}

/**
 * Mock runtime dependencies for testing
 */
export const mockDependencies: RuntimeDependencies = {
	logger: {
		info: (message: string) => console.log(`[INFO] ${message}`),
		error: (message: string) => console.error(`[ERROR] ${message}`),
		debug: (message: string) => console.debug(`[DEBUG] ${message}`),
	},
	database: {
		query: async () => ({ rows: [], rowCount: 0 }),
		connect: async () => true,
		disconnect: async () => true,
	},
	cache: {
		get: async () => null,
		set: async () => true,
		delete: async () => true,
	},
}

/**
 * Helper function to create a test context
 */
export function createTestContext(initialData: Record<string, any> = {}) {
	const context = new Context(initialData, {
		executionId: 'test-execution',
		blueprintId: 'test-blueprint',
		currentNodeId: 'test-node',
		startedAt: new Date(),
		environment: 'development' as const,
	})

	return {
		context,
		input: initialData.input,
		metadata: context.getMetadata(),
		dependencies: {},
		params: {},
	}
}

/**
 * Helper function to create a simple test blueprint
 */
export function createSimpleTestBlueprint() {
	return {
		id: 'test-blueprint',
		nodes: [
			{
				id: 'start',
				uses: 'echo',
				params: {},
			},
			{
				id: 'end',
				uses: 'echo',
				params: {},
			},
		],
		edges: [
			{
				source: 'start',
				target: 'end',
			},
		],
	}
}

/**
 * Helper function to create a branching test blueprint
 */
export function createBranchingTestBlueprint() {
	return {
		id: 'branching-blueprint',
		nodes: [
			{
				id: 'start',
				uses: 'conditionalBranch',
				params: {},
			},
			{
				id: 'true-branch',
				uses: 'echo',
				params: { message: 'true path' },
			},
			{
				id: 'false-branch',
				uses: 'echo',
				params: { message: 'false path' },
			},
		],
		edges: [
			{
				source: 'start',
				target: 'true-branch',
				action: 'true',
			},
			{
				source: 'start',
				target: 'false-branch',
				action: 'false',
			},
		],
	}
}

/**
 * Helper function to create a parallel test blueprint
 */
export function createParallelTestBlueprint() {
	return {
		id: 'parallel-blueprint',
		nodes: [
			{
				id: 'start',
				uses: 'echo',
				params: { message: 'start' },
			},
			{
				id: 'parallel-container',
				uses: 'parallel-container',
				params: {
					sources: ['branch1', 'branch2'],
					strategy: 'all',
				},
			},
			{
				id: 'branch1',
				uses: 'echo',
				params: { message: 'branch 1' },
			},
			{
				id: 'branch2',
				uses: 'echo',
				params: { message: 'branch 2' },
			},
			{
				id: 'end',
				uses: 'echo',
				params: { message: 'end' },
			},
		],
		edges: [
			{
				source: 'start',
				target: 'parallel-container',
			},
			{
				source: 'parallel-container',
				target: 'end',
			},
		],
	}
}

/** **[Task 1b Test]** A custom error for testing signal propagation. */
class AbortError extends Error {
	constructor() {
		super('The operation was aborted.')
		this.name = 'AbortError'
	}
}

/** **[Task 1b Test]** A cancellation-aware sleep utility. */
export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			return reject(new AbortError())
		}
		const timeoutId = setTimeout(resolve, ms)
		signal?.addEventListener('abort', () => {
			clearTimeout(timeoutId)
			reject(new AbortError())
		})
	})
}

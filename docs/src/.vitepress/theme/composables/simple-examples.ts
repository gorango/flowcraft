import { createFlow, type WorkflowBlueprint } from 'flowcraft'

async function mockApiCall(name: string, delay: number, shouldFail = false) {
	console.log(`[${name}] Starting...`)
	await new Promise(resolve => setTimeout(resolve, delay))
	if (shouldFail) {
		console.error(`[${name}] Failing as requested.`)
		throw new Error(`API call "${name}" failed.`)
	}
	const result = { data: `Data from ${name}` }
	console.log(`[${name}] Finished.`)
	return { output: result }
}

// --- 1. Basic Sequential Workflow ---

export const basicFlow = createFlow('basic-workflow')
	.node('step-a', () => mockApiCall('Step A', 1000))
	.node('step-b', async ({ input }) => {
		console.log('[Step B] Received input:', input)
		return mockApiCall('Step B', 1500)
	})
	.node('step-c', async ({ input }) => {
		console.log('[Step C] Received input:', input)
		return mockApiCall('Step C', 500)
	})
	.edge('step-a', 'step-b')
	.edge('step-b', 'step-c')

// --- 2. Conditional Branching Workflow ---

const branchingFlow = createFlow('branching-workflow')
	.node('start', async () => {
		const shouldGoLeft = Math.random() > 0.5
		console.log(`[Start] Condition is: ${shouldGoLeft ? 'left' : 'right'}`)
		return { action: shouldGoLeft ? 'go-left' : 'go-right' }
	})
	.node('left-branch', () => mockApiCall('Left Branch', 1000))
	.node('right-branch', () => mockApiCall('Right Branch', 1000))
	.node('end', async ({ input }) => {
		console.log('[End] Received input from branch:', input)
		return { output: 'Completed' }
	}, { config: { joinStrategy: 'any' } })
	.edge('start', 'left-branch', { action: 'go-left' })
	.edge('start', 'right-branch', { action: 'go-right' })
	.edge('left-branch', 'end')
	.edge('right-branch', 'end')

// --- 3. Parallel Execution Workflow ---

export const parallelFlow = createFlow('parallel-workflow')
	.node('start-parallel', async () => ({ output: 'start' }))
	.node('task-1', () => mockApiCall('Task 1', 2000))
	.node('task-2', () => mockApiCall('Task 2', 1000))
	.node('task-3', () => mockApiCall('Task 3', 1500))
	.node('gather', async (ctx) => {
		const t1 = await ctx.context.get('_outputs.task-1')
		const t2 = await ctx.context.get('_outputs.task-2')
		const t3 = await ctx.context.get('_outputs.task-3')
		console.log('[Gather] All tasks finished.')
		return { output: { t1, t2, t3 } }
	})
	.edge('start-parallel', 'task-1')
	.edge('start-parallel', 'task-2')
	.edge('start-parallel', 'task-3')
	.edge('task-1', 'gather')
	.edge('task-2', 'gather')
	.edge('task-3', 'gather')

// --- 4. Error Handling and Retries Workflow ---
let failCount = 0
async function flakyApi() {
	failCount++
	if (failCount <= 2) {
		return mockApiCall('Flaky API', 500, true) // Fail first 2 times
	}
	return mockApiCall('Flaky API', 500, false) // Succeed on the 3rd
}

export const errorFlow = createFlow('error-workflow')
	.node('start-error', async () => ({ output: 'start' }))
	.node('flaky-node', flakyApi, { config: { maxRetries: 3 } })
	.node('fallback-node', () => mockApiCall('Fallback', 500))
	.node('final-step', async ({ input }) => {
		console.log('[Final Step] Received:', input)
		return { output: 'Workflow finished' }
	})
	.edge('start-error', 'flaky-node')
	.edge('flaky-node', 'final-step')

// --- 5. Awaitable (HITL) Workflow ---

export const hitlFlow = createFlow('hitl-workflow')
	.node('start-approval', async () => ({ output: { user: 'Alice', amount: 1500 } }))
	.wait('wait-for-approval') // This node pauses execution
	.node('process-decision', async ({ input }) => {
		// The `input` comes from the runtime.resume() call
		if (input?.approved) {
			return { output: 'Request was approved.' }
		}
		return { output: 'Request was denied.', action: 'denied' }
	})
	.edge('start-approval', 'wait-for-approval')
	.edge('wait-for-approval', 'process-decision')

// --- Export Collection ---

export const simpleExamples: Record<string, {
	blueprint: WorkflowBlueprint
	functionRegistry: Map<string, any>
}> = {
	'1.basic': {
		blueprint: basicFlow.toBlueprint(),
		functionRegistry: basicFlow.getFunctionRegistry(),
	},
	'2.branching': {
		blueprint: branchingFlow.toBlueprint(),
		functionRegistry: branchingFlow.getFunctionRegistry(),
	},
	'3.parallel': {
		blueprint: parallelFlow.toBlueprint(),
		functionRegistry: parallelFlow.getFunctionRegistry(),
	},
	'4.error-handling': {
		blueprint: errorFlow.toBlueprint(),
		functionRegistry: errorFlow.getFunctionRegistry(),
	},
	'5.hitl': {
		blueprint: hitlFlow.toBlueprint(),
		functionRegistry: hitlFlow.getFunctionRegistry(),
	},
}

export const simpleExamplesConfig: Record<string, {
	entryWorkflowId: string
	initialContext: Record<string, any>
}> = {
	'1.basic': {
		entryWorkflowId: 'basic-workflow',
		initialContext: {},
	},
	'2.branching': {
		entryWorkflowId: 'branching-workflow',
		initialContext: {},
	},
	'3.parallel': {
		entryWorkflowId: 'parallel-workflow',
		initialContext: {},
	},
	'4.error-handling': {
		entryWorkflowId: 'error-workflow',
		initialContext: {},
	},
	'5.hitl': {
		entryWorkflowId: 'hitl-workflow',
		initialContext: {},
	},
}

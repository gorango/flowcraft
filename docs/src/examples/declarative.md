<script setup>
import { goal, job, review, moderation } from '../.vitepress/theme/composables/diagrams.ts'
</script>

# Dynamic AI Agent from JSON Files

[[view source code]](https://github.com/gorango/flowcraft/tree/master/examples/4a.declarative-in-memory)

This example demonstrates a runtime engine that can execute complex, graph-based AI workflows defined as simple JSON files. It showcases how to build a powerful AI agent that can reason, branch, and call other workflows recursively using the workflow framework.

## The Goal

Demonstrate a runtime engine that executes complex, graph-based AI workflows defined as JSON files, with support for parallelism, branching, and nested workflows.

<Diagram :nodes="goal.nodes" :edges="goal.edges" style="height: 600px" />

## The Blueprints

#### [`job-application`](https://github.com/gorango/flowcraft/tree/master/examples/5.declarative-shared-logic/data/2.job-application)

<Diagram :nodes="job.nodes" :edges="job.edges" />

#### [`customer-review`](https://github.com/gorango/flowcraft/tree/master/examples/5.declarative-shared-logic/data/3.customer-review)

<Diagram :nodes="review.nodes" :edges="review.edges" />

#### [`content-moderation`](https://github.com/gorango/flowcraft/tree/master/examples/5.declarative-shared-logic/data/4.content-moderation)

<Diagram :nodes="moderation.nodes" :edges="moderation.edges" />

## The Code

#### `nodes.ts`
Defines node functions for processing LLM tasks, including resolving inputs, handling conditions, routing, and generating output based on workflow parameters.

```typescript
import type { IAsyncContext, NodeContext, NodeResult, RuntimeDependencies } from 'flowcraft'
import { callLLM, resolveTemplate } from './utils.js'

/**
 * A generic context for our LLM nodes.
 */
interface LlmNodeContext extends NodeContext<Record<string, any>, RuntimeDependencies> {
	params: {
		promptTemplate: string
		inputs: Record<string, string | string[]>
		outputKey?: string
	}
	context: IAsyncContext
}

/**
 * Resolves input values from the context based on the node's `inputs` mapping.
 */
async function resolveInputs(
	context: IAsyncContext<any>,
	inputs: Record<string, string | string[]>,
): Promise<Record<string, any>> {
	const resolved: Record<string, any> = {}
	for (const [templateKey, sourceKeyOrKeys] of Object.entries(inputs)) {
		const sourceKeys = Array.isArray(sourceKeyOrKeys) ? sourceKeyOrKeys : [sourceKeyOrKeys]
		let valueFound = false
		for (const sourceKey of sourceKeys) {
			if (await context.has(sourceKey)) {
				const value = await context.get(sourceKey)
				// Ensure we don't pass 'undefined' if the key exists but has no value
				if (value !== undefined) {
					resolved[templateKey] = value
					valueFound = true
					break // Found a value, no need to check other keys for this template variable
				}
			}
		}
		if (!valueFound) {
			// If an input isn't found (e.g., from an untaken branch), use an empty string.
			resolved[templateKey] = ''
		}
	}
	return resolved
}

export async function llmProcess(ctx: NodeContext<Record<string, any>, RuntimeDependencies>): Promise<NodeResult> {
	const llmCtx = ctx as any as LlmNodeContext
	const templateData = await resolveInputs(ctx.context, llmCtx.params.inputs)
	const prompt = resolveTemplate(llmCtx.params.promptTemplate, templateData)
	const result = await callLLM(prompt)
	return { output: result }
}

export async function llmCondition(ctx: NodeContext<Record<string, any>, RuntimeDependencies>): Promise<NodeResult> {
	const result = await llmProcess(ctx)
	const action = result.output?.toLowerCase().includes('true') ? 'true' : 'false'
	return { action, output: result.output }
}

export async function llmRouter(ctx: NodeContext<Record<string, any>, RuntimeDependencies>): Promise<NodeResult> {
	const result = await llmProcess(ctx)
	const action = result.output?.trim() ?? 'default'
	return { action, output: result.output }
}

export async function outputNode(ctx: NodeContext<Record<string, any>, RuntimeDependencies>): Promise<NodeResult> {
	const llmCtx = ctx as any as LlmNodeContext
	const { outputKey = 'final_output' } = llmCtx.params
	const templateData = await resolveInputs(ctx.context, llmCtx.params.inputs)
	const finalOutput = resolveTemplate(llmCtx.params.promptTemplate, templateData)
	await ctx.context.set(outputKey as any, finalOutput)
	return { output: finalOutput }
}
```

#### `utils.ts`
Provides utility functions for interacting with the OpenAI API to call LLMs and for resolving template strings with dynamic data.

```typescript
import OpenAI from 'openai'
import 'dotenv/config'

const openaiClient = new OpenAI()

/**
 * Calls the OpenAI Chat Completions API.
 * @param prompt The user prompt to send to the LLM.
 * @returns The content of the LLM's response as a string.
 */
export async function callLLM(prompt: string): Promise<string> {
	try {
		console.log(`\n--- Sending to LLM ---\n${prompt.substring(0, 300)}...\n---------------------\n`)
		const response = await openaiClient.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [{ role: 'user', content: prompt }],
			temperature: 0.2,
		})
		const result = response.choices[0].message.content || ''
		console.log(`--- Received from LLM ---\n${result}\n-----------------------\n`)
		return result
	} catch (error: any) {
		console.error('Error calling OpenAI API:', error)
		throw new Error(`OpenAI API call failed: ${error.message}`)
	}
}

/**
 * Resolves a template string by replacing {{key}} with values from a data object.
 * This is crucial for dynamically constructing prompts.
 */
export function resolveTemplate(template: string, data: Record<string, any>): string {
	return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
		const value = data[key.trim()]
		if (value === undefined || value === null) {
			console.warn(`Template variable '{{${key.trim()}}}' not found in data.`)
			return `{{${key.trim()}}}`
		}
		return String(value)
	})
}
```

#### `registry.ts`
Creates a node registry that maps string identifiers to their corresponding function implementations for use in the workflow runtime.

```typescript
import type { NodeRegistry } from 'flowcraft'
import { llmCondition, llmProcess, llmRouter, outputNode } from './nodes.js'

/**
 * A central registry mapping the string 'uses' from a blueprint
 * to the actual node function implementation.
 * This is created once and passed to the FlowRuntime.
 */
export const agentNodeRegistry: NodeRegistry = {
	'llm-process': llmProcess,
	'llm-condition': llmCondition,
	'llm-router': llmRouter,
	output: outputNode,
	// The 'subflow' node is built-in to runtime, so it doesn't need to be registered here.
}
```

#### `blueprints.ts`
Loads JSON workflow definitions from files, processes them into WorkflowBlueprint objects, and handles node configurations for convergence points.

```typescript
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NodeDefinition, WorkflowBlueprint } from 'flowcraft'

/**
 * Loads a JSON graph and transforms it into a WorkflowBlueprint.
 * It also intelligently configures nodes that are convergence points for routers.
 */
function loadAndProcessBlueprint(filePath: string): WorkflowBlueprint {
	const fileContent = fs.readFileSync(filePath, 'utf-8')
	const graph = JSON.parse(fileContent)
	const blueprintId = path.basename(filePath, '.json')

	const nodes: NodeDefinition[] = graph.nodes.map((n: any) => ({
		id: n.id,
		uses: n.uses,
		config: n.config,
		params: n.uses === 'subflow'
			? {
				// Ensure blueprintId is a string
				blueprintId: n.params.blueprintId.toString(),
				...n.params,
			}
			: n.params,
	}))

	const edges = graph.edges
	const nodePredecessorMap = new Map<string, string[]>()

	// Wire up the edges to the nodes
	edges.forEach((edge: any) => {
		if (!nodePredecessorMap.has(edge.target)) nodePredecessorMap.set(edge.target, [])
		nodePredecessorMap.get(edge.target)?.push(edge.source)
	})

	// Check if all predecessors are the same (i.e., it's a fan-out from a single router)
	for (const node of nodes) {
		const predecessors = nodePredecessorMap.get(node.id)
		if (predecessors && predecessors.length > 1) {
			const firstPredecessor = predecessors[0]
			if (predecessors.every((p) => p === firstPredecessor)) {
				console.log(`[Blueprint Loader] Automatically setting joinStrategy='any' for convergence node '${node.id}'`)
				node.config = { ...node.config, joinStrategy: 'any' }
			}
		}
	}

	return { id: blueprintId, nodes, edges }
}

// Load all blueprints from the data directory
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
const useCaseDirs = ['1_job-application', '2_customer-review', '3_content-moderation']

export const blueprints: Record<string, WorkflowBlueprint> = {}

for (const dirName of useCaseDirs) {
	const dirPath = path.join(dataDir, dirName)
	const files = fs.readdirSync(dirPath)
	for (const file of files) {
		if (file.endsWith('.json')) {
			const blueprint = loadAndProcessBlueprint(path.join(dirPath, file))
			blueprints[blueprint.id] = blueprint
		}
	}
}
```

#### `config.ts`
Defines configuration objects for various use cases, specifying the entry workflow ID and initial context data for each scenario.

```typescript
// The configuration object defines the different scenarios this example can run.
export const config = {
	'1_job-application': {
		entryWorkflowId: '100',
		initialContext: {
			applicantName: 'Jane Doe',
			resume:
				'Experienced developer with a background in TypeScript, Node.js, and building complex DAG workflow systems. Also proficient in React and SQL.',
			coverLetter: 'To Whom It May Concern, I am writing to express my interest in the Senior Developer position.',
		},
	},
	'2_customer-review': {
		entryWorkflowId: '200',
		initialContext: {
			initial_review:
				'The new dashboard is a huge improvement, but I noticed that the export-to-PDF feature is really slow and sometimes crashes the app on large datasets. It would be great if you could look into this.',
		},
	},
	'3_content-moderation': {
		entryWorkflowId: '300',
		initialContext: {
			userId: 'user-456',
			userPost: 'Hi, I need help with my account. My email is test@example.com and my phone is 555-123-4567.',
		},
	},
} as const
```

#### `main.ts`
Serves as the entry point, initializing the FlowRuntime with the node registry and blueprints, then executing the specified workflow with initial context.

```typescript
import { FlowRuntime } from 'flowcraft'
import { blueprints } from './blueprints.js'
import { config } from './config.js'
import { agentNodeRegistry } from './registry.js'

type UseCase = keyof typeof config

const ACTIVE_USE_CASE: UseCase = '4.content-moderation' // Change this to test other scenarios

async function main() {
	console.log(`--- Running Use-Case (Data-First): ${ACTIVE_USE_CASE} ---\n`)

	const runtime = new FlowRuntime({
		registry: agentNodeRegistry,
		blueprints,
	})

	const entryWorkflowId = config[ACTIVE_USE_CASE].entryWorkflowId
	const mainBlueprint = blueprints[entryWorkflowId]

	if (!mainBlueprint) throw new Error(`Main workflow blueprint with ID '${entryWorkflowId}' was not found.`)

	const { initialContext } = config[ACTIVE_USE_CASE]

	const result = await runtime.run(mainBlueprint, initialContext)

	console.log('\n--- Workflow Complete ---\n')
	console.log('Final Output:\n')
	console.log(result.context.final_output)
	console.log('\n--- Final Context State ---')
	console.dir(result.context, { depth: null })
}

main().catch(console.error)
```

---

[[view source code]](https://github.com/gorango/flowcraft/tree/master/examples/4a.declarative-in-memory)

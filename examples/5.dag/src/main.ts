import type { NodeDefinition, WorkflowBlueprint } from 'flowcraft'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { FlowRuntime } from 'flowcraft'
import { agentNodeRegistry } from './registry.js'
import 'dotenv/config'

// The configuration object defines the different scenarios this sandbox can run.
const config = {
	'1.blog-post': {
		mainWorkflowId: '100',
		getInitialContext: () => ({
			topic: 'The rise of AI-powered workflow automation in modern software development.',
		}),
	},
	'2.job-application': {
		mainWorkflowId: '200',
		getInitialContext: () => ({
			applicantName: 'Jane Doe',
			resume: 'Experienced developer with a background in TypeScript, Node.js, and building complex DAG workflow systems. Also proficient in React and SQL.',
			coverLetter: 'To Whom It May Concern, I am writing to express my interest in the Senior Developer position.',
		}),
	},
	'3.customer-review': {
		mainWorkflowId: '300',
		getInitialContext: () => ({
			initial_review: 'The new dashboard is a huge improvement, but I noticed that the export-to-PDF feature is really slow and sometimes crashes the app on large datasets. It would be great if you could look into this.',
		}),
	},
	'4.content-moderation': {
		mainWorkflowId: '400',
		getInitialContext: () => ({
			userId: 'user-456',
			userPost: 'Hi, I need help with my account. My email is test@example.com and my phone is 555-123-4567.',
		}),
	},
} as const

type UseCase = keyof typeof config

const ACTIVE_USE_CASE: UseCase = '4.content-moderation' // Change this to test other scenarios

/**
 * Loads a legacy JSON graph and transforms it into a modern WorkflowBlueprint.
 * It also intelligently configures nodes that are convergence points for routers.
 */
async function loadAndProcessBlueprint(filePath: string): Promise<WorkflowBlueprint> {
	const fileContent = await fs.readFile(filePath, 'utf-8')
	const v1Graph = JSON.parse(fileContent)
	const blueprintId = path.basename(filePath, '.json')

	const nodes: NodeDefinition[] = v1Graph.nodes.map((v1Node: any) => {
		// Map the legacy format to the new format
		const node: NodeDefinition = {
			id: v1Node.id,
			uses: v1Node.type,
			params: v1Node.data,
			config: v1Node.config,
		}

		// **UPGRADE**: If the old format uses 'sub-workflow', map it to the built-in 'subflow'
		if (node.uses === 'sub-workflow') {
			node.uses = 'subflow'
			node.params = {
				blueprintId: v1Node.data.workflowId.toString(),
				inputs: v1Node.data.inputs,
				outputs: v1Node.data.outputs,
			}
		}

		return node
	})

	const edges = v1Graph.edges

	// --- **NEW**: Smartly configure joinStrategy for router convergence points ---
	const nodePredecessorMap = new Map<string, string[]>()
	edges.forEach((edge: any) => {
		if (!nodePredecessorMap.has(edge.target))
			nodePredecessorMap.set(edge.target, [])
		nodePredecessorMap.get(edge.target)!.push(edge.source)
	})

	for (const node of nodes) {
		const predecessors = nodePredecessorMap.get(node.id)
		if (predecessors && predecessors.length > 1) {
			// Check if all predecessors are the same (i.e., it's a fan-out from a single router)
			const firstPredecessor = predecessors[0]
			if (predecessors.every(p => p === firstPredecessor)) {
				console.log(`[Blueprint Loader] Automatically setting joinStrategy='any' for convergence node '${node.id}'`)
				node.config = { ...node.config, joinStrategy: 'any' }
			}
		}
	}
	// --- End of smart configuration ---

	return { id: blueprintId, nodes, edges }
}

async function main() {
	console.log(`--- Running Use-Case (Data-First): ${ACTIVE_USE_CASE} ---\n`)

	// Load all blueprints so they are available for sub-workflow calls.
	const blueprints: Record<string, WorkflowBlueprint> = {}
	const useCaseDirs = ['1.blog-post', '2.job-application', '3.customer-review', '4.content-moderation']
	for (const dirName of useCaseDirs) {
		const dirPath = path.join(process.cwd(), 'data', dirName)
		const files = await fs.readdir(dirPath)
		for (const file of files) {
			if (file.endsWith('.json')) {
				const blueprint = await loadAndProcessBlueprint(path.join(dirPath, file))
				blueprints[blueprint.id] = blueprint
			}
		}
	}

	const runtime = new FlowRuntime({
		registry: agentNodeRegistry,
		blueprints,
	})

	const mainWorkflowId = config[ACTIVE_USE_CASE].mainWorkflowId
	const mainBlueprint = blueprints[mainWorkflowId]

	if (!mainBlueprint)
		throw new Error(`Main workflow blueprint with ID '${mainWorkflowId}' was not found.`)

	const initialContext = config[ACTIVE_USE_CASE].getInitialContext()

	const result = await runtime.run(mainBlueprint, initialContext)

	console.log('\n--- Workflow Complete ---\n')
	console.log('Final Output:\n')
	// **FIXED**: The final output is stored under the 'outputKey' from the final node.
	console.log(result.context.final_output)
	console.log('\n--- Final Context State ---')
	console.dir(result.context, { depth: null })
}

main().catch(console.error)

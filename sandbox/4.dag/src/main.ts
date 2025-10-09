import type { EdgeDefinition, NodeDefinition, WorkflowBlueprint } from 'flowcraft/v2'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { FlowcraftRuntime } from 'flowcraft/v2'
import { agentNodeRegistry } from './registry.js'
import 'dotenv/config'

// The configuration object defines the different scenarios this sandbox can run.
const config = {
	'1.blog-post': {
		mainWorkflowId: 100,
		getInitialContext: () => ({
			topic: 'The rise of AI-powered workflow automation in modern software development.',
		}),
	},
	'2.job-application': {
		mainWorkflowId: 200,
		getInitialContext: () => ({
			applicantName: 'Jane Doe',
			resume: 'Experienced developer with a background in TypeScript, Node.js, and building complex DAG workflow systems. Also proficient in React and SQL.',
			coverLetter: 'To Whom It May Concern, I am writing to express my interest in the Senior Developer position. My skills and experience align perfectly with the requirements of the role.',
		}),
	},
	'3.customer-review': {
		mainWorkflowId: 300,
		getInitialContext: () => ({
			initial_review: 'The new dashboard is a huge improvement, but I noticed that the export-to-PDF feature is really slow and sometimes crashes the app on large datasets. It would be great if you could look into this.',
		}),
	},
	'4.content-moderation': {
		mainWorkflowId: 400,
		getInitialContext: () => ({
			userId: 'user-456',
			userPost: `I don't want any dirty immigrants in my country, stealing, raping, and killing my people. They should all be eradicated!`,
		}),
	},
} as const

type UseCase = keyof typeof config

// --- CONFIGURATION ---
const ACTIVE_USE_CASE: UseCase = '2.job-application'
// ---------------------

/**
 * Loads a V1-style JSON graph and correctly transforms it into a valid V2 WorkflowBlueprint.
 * @param filePath The full path to the JSON file.
 * @returns A valid WorkflowBlueprint object ready for the V2 runtime.
 */
async function loadBlueprint(filePath: string): Promise<WorkflowBlueprint> {
	const fileContent = await fs.readFile(filePath, 'utf-8')
	const v1Graph = JSON.parse(fileContent)
	const blueprintId = path.basename(filePath, '.json')

	// Map the V1 node structure to the V2 NodeDefinition structure.
	const v2Nodes: NodeDefinition[] = v1Graph.nodes.map((v1Node: any) => {
		if (v1Node.type === 'sub-workflow') {
			// Special handling for sub-workflows to match the v2 built-in 'subflow' node.
			return {
				id: v1Node.id,
				uses: 'subflow', // Use the v2 built-in name
				params: {
					blueprintId: v1Node.data.workflowId,
					inputs: v1Node.data.inputs,
					outputs: v1Node.data.outputs,
				},
				config: v1Node.config,
			}
		}

		// Standard mapping for all other nodes.
		return {
			id: v1Node.id,
			uses: v1Node.type, // Map 'type' to 'uses'
			params: v1Node.data, // Map 'data' to 'params'
			config: v1Node.config, // Pass 'config' through directly
		}
	})

	const nodeIds = new Set(v2Nodes.map(n => n.id))
	const targetIds = new Set(v1Graph.edges.map((e: any) => e.target))
	const startNodeIds = Array.from(nodeIds).filter(id => !targetIds.has(id))

	if (startNodeIds.length > 1) {
		// More than one start node means this is a parallel fan-out graph.
		const parallelContainerId = `__parallel_start_${blueprintId}`

		// Add the synthetic parallel container node.
		v2Nodes.push({
			id: parallelContainerId,
			uses: 'parallel-container',
			params: {
				branches: startNodeIds,
			},
		})

		// Find the node(s) where all parallel branches converge (fan-in).
		const successors = new Set<string>()
		v1Graph.edges.forEach((edge: EdgeDefinition) => {
			if (startNodeIds.includes(edge.source)) {
				successors.add(edge.target)
			}
		})

		// Rewire the graph: All convergent paths now originate from the container.
		const newEdges = v1Graph.edges.filter((edge: EdgeDefinition) => !startNodeIds.includes(edge.source))
		successors.forEach((successorId) => {
			newEdges.push({
				source: parallelContainerId,
				target: successorId,
			})
		})

		return { id: blueprintId, nodes: v2Nodes, edges: newEdges }
	}
	// --- End of Graph Analysis ---

	return { id: blueprintId, nodes: v2Nodes, edges: v1Graph.edges }
}

async function main() {
	console.log(`--- Running V2 Use-Case (Data-First): ${ACTIVE_USE_CASE} ---\n`)

	const runtime = new FlowcraftRuntime({
		registry: agentNodeRegistry,
		environment: 'development',
	})

	// Load and register all blueprints so they are available for sub-workflow calls.
	const useCaseDirs = ['1.blog-post', '2.job-application', '3.customer-review', '4.content-moderation']
	for (const dirName of useCaseDirs) {
		const dirPath = path.join(process.cwd(), 'data', dirName)
		try {
			const files = await fs.readdir(dirPath)
			for (const file of files) {
				if (file.endsWith('.json')) {
					const blueprint = await loadBlueprint(path.join(dirPath, file))
					runtime.registerBlueprint(blueprint)
				}
			}
		}
		catch (error) {
			console.error(`Could not load blueprints from directory: ${dirPath}`, error)
		}
	}

	const mainWorkflowId = config[ACTIVE_USE_CASE].mainWorkflowId.toString()
	const mainBlueprint = runtime.getBlueprint(mainWorkflowId)

	if (!mainBlueprint) {
		throw new Error(`Main workflow blueprint with ID '${mainWorkflowId}' was not found in the runtime.`)
	}

	const initialContext = config[ACTIVE_USE_CASE].getInitialContext()

	const result = await runtime.run(mainBlueprint, initialContext)

	console.log('\n--- Workflow Complete ---\n')
	console.log('Final Output:\n')
	console.log(result.context.final_output)
	console.log('\n--- Final Context State ---')
	console.dir(result.context, { depth: null })
}

main().catch(console.error)

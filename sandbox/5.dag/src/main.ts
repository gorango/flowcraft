import type { NodeDefinition, WorkflowBlueprint } from 'flowcraft'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { FlowcraftRuntime } from 'flowcraft'
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
			userPost: 'Hi, I need help with my account. My email is test@example.com and my phone is 555-123-4567.',
		}),
	},
} as const

type UseCase = keyof typeof config

const ACTIVE_USE_CASE: UseCase = '4.content-moderation' // Change this to test other scenarios

async function loadBlueprint(filePath: string): Promise<WorkflowBlueprint> {
	const fileContent = await fs.readFile(filePath, 'utf-8')
	const v1Graph = JSON.parse(fileContent)
	const blueprintId = path.basename(filePath, '.json')

	const v2Nodes: NodeDefinition[] = v1Graph.nodes.map((v1Node: any) => {
		if (v1Node.type === 'sub-workflow') {
			return {
				id: v1Node.id,
				uses: 'subflow',
				params: {
					blueprintId: v1Node.data.workflowId.toString(),
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

	return { id: blueprintId, nodes: v2Nodes, edges: v1Graph.edges }
}

async function main() {
	console.log(`--- Running Use-Case (Data-First): ${ACTIVE_USE_CASE} ---\n`)

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
	console.log(result.context.moderation_result)
	console.log('\n--- Final Context State ---')
	console.dir(result.context, { depth: null })
}

main().catch(console.error)

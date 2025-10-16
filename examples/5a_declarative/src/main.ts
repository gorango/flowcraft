import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import type { NodeDefinition, WorkflowBlueprint } from 'flowcraft'
import { FlowRuntime } from 'flowcraft'
import { config } from './config.js'
import { agentNodeRegistry } from './registry.js'
import 'dotenv/config'

type UseCase = keyof typeof config

const ACTIVE_USE_CASE: UseCase = '4.content-moderation' // Change this to test other scenarios

/**
 * Loads a legacy JSON graph and transforms it into a modern WorkflowBlueprint.
 * It also intelligently configures nodes that are convergence points for routers.
 */
async function loadAndProcessBlueprint(filePath: string): Promise<WorkflowBlueprint> {
	const fileContent = await fs.readFile(filePath, 'utf-8')
	const graph = JSON.parse(fileContent)
	const blueprintId = path.basename(filePath, '.json')

	const nodes: NodeDefinition[] = graph.nodes.map((n: any) => {
		// Map the data format to the framework format
		const node: NodeDefinition = {
			id: n.id,
			uses: n.uses,
			params: n.params,
			config: n.config,
		}

		if (node.uses === 'subflow') {
			// Ensure blueprintId is a string
			node.params = {
				blueprintId: n.params.blueprintId.toString(),
				inputs: n.params.inputs,
				outputs: n.params.outputs,
			}
		}

		return node
	})

	const edges = graph.edges

	const nodePredecessorMap = new Map<string, string[]>()
	edges.forEach((edge: any) => {
		if (!nodePredecessorMap.has(edge.target)) nodePredecessorMap.set(edge.target, [])
		nodePredecessorMap.get(edge.target)?.push(edge.source)
	})

	for (const node of nodes) {
		const predecessors = nodePredecessorMap.get(node.id)
		if (predecessors && predecessors.length > 1) {
			// Check if all predecessors are the same (i.e., it's a fan-out from a single router)
			const firstPredecessor = predecessors[0]
			if (predecessors.every((p) => p === firstPredecessor)) {
				console.log(`[Blueprint Loader] Automatically setting joinStrategy='any' for convergence node '${node.id}'`)
				node.config = { ...node.config, joinStrategy: 'any' }
			}
		}
	}

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

	if (!mainBlueprint) throw new Error(`Main workflow blueprint with ID '${mainWorkflowId}' was not found.`)

	const { initialContext } = config[ACTIVE_USE_CASE]

	const result = await runtime.run(mainBlueprint, initialContext)

	console.log('\n--- Workflow Complete ---\n')
	console.log('Final Output:\n')
	console.log(result.context.final_output)
	console.log('\n--- Final Context State ---')
	console.dir(result.context, { depth: null })
}

main().catch(console.error)

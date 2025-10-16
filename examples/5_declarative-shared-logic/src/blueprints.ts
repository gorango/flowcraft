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

// Load all blueprints from the data directory
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
const useCaseDirs = ['1.blog-post', '2.job-application', '3.customer-review', '4.content-moderation']

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

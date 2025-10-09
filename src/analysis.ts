import type { WorkflowBlueprint } from './types'

/**
 * A list of cycles found in the graph. Each cycle is an array of node IDs.
 */
export type Cycles = string[][]

/**
 * Analyzes a V2 workflow blueprint to detect cycles.
 * @param blueprint The WorkflowBlueprint object containing nodes and edges.
 * @returns An array of cycles found. Each cycle is represented as an array of node IDs.
 */
export function checkForCycles(blueprint: WorkflowBlueprint): Cycles {
	const cycles: Cycles = []
	if (!blueprint || !blueprint.nodes || blueprint.nodes.length === 0) {
		return cycles
	}

	const allNodeIds = blueprint.nodes.map(node => node.id)
	const adj = new Map<string, string[]>()
	allNodeIds.forEach(id => adj.set(id, []))
	blueprint.edges.forEach(edge => adj.get(edge.source)?.push(edge.target))

	const visited = new Set<string>()
	const recursionStack = new Set<string>()

	function detectCycleUtil(nodeId: string, path: string[]) {
		visited.add(nodeId)
		recursionStack.add(nodeId)
		path.push(nodeId)

		const neighbors = adj.get(nodeId) || []
		for (const neighbor of neighbors) {
			if (recursionStack.has(neighbor)) {
				const cycleStartIndex = path.indexOf(neighbor)
				const cycle = path.slice(cycleStartIndex)
				cycles.push([...cycle, neighbor])
			}
			else if (!visited.has(neighbor)) {
				detectCycleUtil(neighbor, path)
			}
		}

		recursionStack.delete(nodeId)
		path.pop()
	}

	for (const nodeId of allNodeIds) {
		if (!visited.has(nodeId)) {
			detectCycleUtil(nodeId, [])
		}
	}

	return cycles
}

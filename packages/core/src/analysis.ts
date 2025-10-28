import type { WorkflowBlueprint } from './types'

/**
 * A list of cycles found in the graph. Each cycle is an array of node IDs.
 */
export type Cycles = string[][]

/**
 * Analysis result for a workflow blueprint
 */
export interface BlueprintAnalysis {
	/** Cycles found in the graph */
	cycles: Cycles
	/** Node IDs that have no incoming edges (start nodes) */
	startNodeIds: string[]
	/** Node IDs that have no outgoing edges (terminal nodes) */
	terminalNodeIds: string[]
	/** Total number of nodes */
	nodeCount: number
	/** Total number of edges */
	edgeCount: number
	/** Whether the graph is a valid DAG (no cycles) */
	isDag: boolean
}

/**
 * Analyzes a workflow blueprint to detect cycles using an iterative DFS algorithm.
 * This avoids stack overflow issues for deep graphs compared to the recursive version.
 * @param blueprint The WorkflowBlueprint object containing nodes and edges.
 * @returns An array of cycles found. Each cycle is represented as an array of node IDs.
 */
export function checkForCycles(blueprint: WorkflowBlueprint): Cycles {
	const cycles: Cycles = []
	if (!blueprint || !blueprint.nodes || blueprint.nodes.length === 0) {
		return cycles
	}

	const allNodeIds = blueprint.nodes.map((node) => node.id)
	const adj = new Map<string, string[]>()
	for (const id of allNodeIds) {
		adj.set(id, [])
	}
	for (const edge of blueprint.edges) {
		adj.get(edge.source)?.push(edge.target)
	}

	// 0 = not visited, 1 = visiting, 2 = visited
	const state = new Map<string, number>()
	for (const id of allNodeIds) {
		state.set(id, 0)
	}

	for (const startNode of allNodeIds) {
		if (state.get(startNode) !== 0) continue

		const stack: { node: string; path: string[] }[] = [{ node: startNode, path: [] }]
		const pathSet = new Set<string>()

		while (stack.length > 0) {
			const { node, path } = stack[stack.length - 1]

			if (state.get(node) === 0) {
				// first visit
				state.set(node, 1) // visiting
				pathSet.add(node)
				path.push(node)
			}

			const neighbors = adj.get(node) || []
			let foundUnvisited = false

			for (const neighbor of neighbors) {
				if (state.get(neighbor) === 1) {
					// back edge, cycle found
					const cycleStartIndex = path.indexOf(neighbor)
					const cycle = path.slice(cycleStartIndex)
					cycles.push([...cycle, neighbor])
				} else if (state.get(neighbor) === 0) {
					// unvisited neighbor
					stack.push({ node: neighbor, path: [...path] })
					foundUnvisited = true
					break
				}
			}

			if (!foundUnvisited) {
				// all neighbors visited
				state.set(node, 2) // visited
				stack.pop()
				pathSet.delete(node)
			}
		}
	}

	return cycles
}

/**
 * Generates Mermaid diagram syntax from a WorkflowBlueprint
 * @param blueprint The WorkflowBlueprint object containing nodes and edges
 * @returns Mermaid syntax string for the flowchart
 */
export function generateMermaid(blueprint: WorkflowBlueprint): string {
	if (!blueprint || !blueprint.nodes || blueprint.nodes.length === 0) {
		return 'flowchart TD\n    empty[Empty Blueprint]'
	}

	let mermaid = 'flowchart TD\n'

	for (const node of blueprint.nodes) {
		// Using backticks and characters like <br/> for newlines in Mermaid labels
		const paramsString = node.params ? `<br/>params: ${JSON.stringify(node.params)}` : ''
		const nodeLabel = `${node.id}${paramsString}`
		mermaid += `    ${node.id}["${nodeLabel}"]\n`
	}

	for (const edge of blueprint.edges || []) {
		const labelParts: string[] = []

		if (edge.action) {
			labelParts.push(edge.action)
		}
		if (edge.condition) {
			labelParts.push(edge.condition)
		}
		if (edge.transform) {
			labelParts.push(edge.transform)
		}

		if (labelParts.length > 0) {
			const edgeLabel = labelParts.join(' | ')
			mermaid += `    ${edge.source} -- "${edgeLabel}" --> ${edge.target}\n`
		} else {
			mermaid += `    ${edge.source} --> ${edge.target}\n`
		}
	}

	return mermaid
}

/**
 * Analyzes a workflow blueprint and returns comprehensive analysis
 * @param blueprint The WorkflowBlueprint object containing nodes and edges
 * @returns Analysis result with cycles, start nodes, terminal nodes, and other metrics
 */
export function analyzeBlueprint(blueprint: WorkflowBlueprint): BlueprintAnalysis {
	if (!blueprint || !blueprint.nodes || blueprint.nodes.length === 0) {
		return {
			cycles: [],
			startNodeIds: [],
			terminalNodeIds: [],
			nodeCount: 0,
			edgeCount: 0,
			isDag: true,
		}
	}

	const cycles = checkForCycles(blueprint)
	const nodeCount = blueprint.nodes.length
	const edgeCount = blueprint.edges?.length || 0

	const nodesWithIncoming = new Set<string>()
	for (const edge of blueprint.edges || []) {
		nodesWithIncoming.add(edge.target)
	}

	const startNodeIds = blueprint.nodes.map((node) => node.id).filter((nodeId) => !nodesWithIncoming.has(nodeId))

	const nodesWithOutgoing = new Set<string>()
	for (const edge of blueprint.edges || []) {
		nodesWithOutgoing.add(edge.source)
	}

	const terminalNodeIds = blueprint.nodes.map((node) => node.id).filter((nodeId) => !nodesWithOutgoing.has(nodeId))

	return {
		cycles,
		startNodeIds,
		terminalNodeIds,
		nodeCount,
		edgeCount,
		isDag: cycles.length === 0,
	}
}

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
 * Analyzes a workflow blueprint to detect cycles.
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

	// Add nodes
	for (const node of blueprint.nodes) {
		const nodeLabel = node.id
		mermaid += `    ${node.id}["${nodeLabel}"]\n`
	}

	// Add edges
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
		}
		else {
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

	// Find nodes with no incoming edges (start nodes)
	const nodesWithIncoming = new Set<string>()
	for (const edge of blueprint.edges || []) {
		nodesWithIncoming.add(edge.target)
	}

	const startNodeIds = blueprint.nodes
		.map(node => node.id)
		.filter(nodeId => !nodesWithIncoming.has(nodeId))

	// Find nodes with no outgoing edges (terminal nodes)
	const nodesWithOutgoing = new Set<string>()
	for (const edge of blueprint.edges || []) {
		nodesWithOutgoing.add(edge.source)
	}

	const terminalNodeIds = blueprint.nodes
		.map(node => node.id)
		.filter(nodeId => !nodesWithOutgoing.has(nodeId))

	return {
		cycles,
		startNodeIds,
		terminalNodeIds,
		nodeCount,
		edgeCount,
		isDag: cycles.length === 0,
	}
}

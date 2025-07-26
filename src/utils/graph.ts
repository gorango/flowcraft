import type { GraphNode, WorkflowGraph } from '../builder/graph.types'

export interface GraphAnalysis {
	nodes: Map<string, GraphNode & { inDegree: number, outDegree: number }>
	allNodeIds: string[]
	startNodeIds: string[]
	cycles: string[][]
}

export interface ValidationError {
	nodeId?: string
	type: string
	message: string
}

export type Validator = (analysis: GraphAnalysis, graph: WorkflowGraph) => ValidationError[]

/**
 * Analyzes a declarative workflow graph definition to extract structural metadata.
 *
 * @param graph The WorkflowGraph object containing nodes and edges.
 * @returns An object containing nodes with degree counts, start nodes, and any cycles.
 */
export function analyzeGraph(graph: WorkflowGraph): GraphAnalysis {
	const analysis: GraphAnalysis = {
		nodes: new Map(),
		allNodeIds: [],
		startNodeIds: [],
		cycles: [],
	}

	if (!graph || !graph.nodes || !graph.nodes.length)
		return analysis

	const allNodeIds = graph.nodes.map(node => node.id)
	analysis.allNodeIds = allNodeIds

	const adj: Map<string, string[]> = new Map()
	graph.nodes.forEach((node) => {
		analysis.nodes.set(node.id, { ...node, inDegree: 0, outDegree: 0 })
		adj.set(node.id, [])
	})

	graph.edges.forEach((edge) => {
		const source = analysis.nodes.get(edge.source)
		const target = analysis.nodes.get(edge.target)
		if (source)
			source.outDegree++
		if (target)
			target.inDegree++
		if (adj.has(edge.source))
			adj.get(edge.source)!.push(edge.target)
	})

	analysis.startNodeIds = allNodeIds.filter(id => analysis.nodes.get(id)!.inDegree === 0)

	const visited = new Set<string>()
	const recursionStack = new Set<string>()

	/** Detect cycles by performing a depth-first search on the graph. */
	function detectCycleUtil(nodeId: string, path: string[]) {
		visited.add(nodeId)
		recursionStack.add(nodeId)
		path.push(nodeId)

		const neighbors = adj.get(nodeId) || []
		for (const neighbor of neighbors) {
			if (!visited.has(neighbor)) {
				detectCycleUtil(neighbor, path)
			}
			else if (recursionStack.has(neighbor)) {
				const cycleStartIndex = path.indexOf(neighbor)
				const cycle = path.slice(cycleStartIndex)
				analysis.cycles.push([...cycle, neighbor]) // Add neighbor to show the closing loop
			}
		}

		recursionStack.delete(nodeId)
		path.pop()
	}

	for (const nodeId of allNodeIds) {
		if (!visited.has(nodeId))
			detectCycleUtil(nodeId, [])
	}

	return analysis
}

/**
 * Factory for creating a validator that checks node connections based on properties.
 *
 * @param description A human-readable description of the rule.
 * @param filter A predicate to select which nodes this rule applies to.
 * @param check A function to check the properties of the selected node.
 * @returns A validator function that takes a graph and returns a list of errors.
 */
export function createNodeRule(
	description: string,
	filter: (node: GraphNode) => boolean,
	check: (node: GraphNode & { inDegree: number, outDegree: number }) => { valid: boolean, message?: string },
): Validator {
	return (analysis: GraphAnalysis): ValidationError[] => {
		const errors: ValidationError[] = []
		for (const node of analysis.nodes.values()) {
			if (filter(node)) {
				const result = check(node)
				if (!result.valid) {
					errors.push({
						nodeId: node.id,
						type: 'ConnectionRuleViolation',
						message: result.message || `Node ${node.id} failed rule: ${description}`,
					})
				}
			}
		}
		return errors
	}
}

/**
 * A built-in validator that reports any cycles found in the graph.
 */
export const checkForCycles: Validator = (analysis: GraphAnalysis): ValidationError[] => {
	return analysis.cycles.map(cycle => ({
		type: 'CycleDetected',
		message: `Cycle detected involving nodes: ${cycle.join(' -> ')}`,
	}))
}

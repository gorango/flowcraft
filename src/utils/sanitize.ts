import type { WorkflowGraph } from '../builder/graph.types'

/**
 * Sanitizes a raw workflow graph object by removing properties that are not
 * relevant to the execution engine, such as UI-specific data.
 *
 * @param rawGraph - The raw graph object, potentially containing extraneous properties.
 * @param rawGraph.nodes - An array of node objects.
 * @param rawGraph.edges - An array of edge objects.
 * @returns A clean, execution-focused `WorkflowGraph` object.
 */
export function sanitizeGraph(rawGraph: { nodes: any[], edges: any[] }): WorkflowGraph {
	const nodes = rawGraph.nodes.map(({ id, type, data, config }) => ({
		id,
		type,
		data,
		...(config && { config }),
	}))

	const edges = rawGraph.edges.map(({ id, source, target, action }) => ({
		id,
		source,
		target,
		...(action && { action }),
	}))

	return { nodes, edges }
}

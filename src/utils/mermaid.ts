import type { AbstractNode, Flow } from '../workflow'
import { DEFAULT_ACTION, FILTER_FAILED } from '../types'

/**
 * Converts a special action symbol to a user-friendly string for the graph label.
 * @param action The action symbol or string.
 * @returns A string label for the Mermaid edge.
 */
function getActionLabel(action: string | symbol): string {
	if (action === DEFAULT_ACTION) {
		return ''
	}
	if (action === FILTER_FAILED) {
		return '"filter failed"'
	}
	return `"${action.toString()}"`
}

/**
 * Generates a Mermaid graph definition from a `Flow` instance.
 *
 * This utility traverses the workflow's node structure and outputs a string
 * that can be rendered by Mermaid.js to visualize the flow's logic,
 * including branching and cycles.
 *
 * @param flow The `Flow` instance to visualize.
 * @returns A string containing the Mermaid `graph TD` definition.
 *
 * @example
 * const startNode = new Node('start');
 * const processNode = new Node('process');
 * const endNode = new Node('end');
 *
 * startNode.next(processNode);
 * processNode.next(endNode);
 *
 * const myFlow = new Flow(startNode);
 * const mermaidSyntax = generateMermaidGraph(myFlow);
 * console.log(mermaidSyntax);
 * // Outputs:
 * // graph TD
 * //   Node_0[Node]
 * //   Node_1[Node]
 * //   Node_2[Node]
 * //   Node_0 --> Node_1
 * //   Node_1 --> Node_2
 */
export function generateMermaidGraph(flow: Flow): string {
	if (!flow.startNode)
		return 'graph TD\n  %% Empty Flow'

	const nodes = new Set<string>()
	const edges = new Set<string>()
	const visited = new Set<AbstractNode>()
	const queue: AbstractNode[] = [flow.startNode]
	const idMap = new Map<AbstractNode, string>()
	const nameCounts = new Map<string, number>()

	/**
	 * Generates a unique, readable ID for a node, e.g., "AddNode_0", "AddNode_1".
	 */
	function getUniqueNodeId(node: AbstractNode): string {
		if (idMap.has(node))
			return idMap.get(node)!

		const baseName = node.constructor.name.replace(/\W/g, '')
		const count = nameCounts.get(baseName) || 0
		const uniqueId = `${baseName}_${count}`
		nameCounts.set(baseName, count + 1)
		idMap.set(node, uniqueId)
		return uniqueId
	}

	visited.add(flow.startNode)
	getUniqueNodeId(flow.startNode)

	while (queue.length > 0) {
		const currentNode = queue.shift()!
		const sourceId = getUniqueNodeId(currentNode)

		nodes.add(`  ${sourceId}[${currentNode.constructor.name}]`)

		for (const [action, successorNode] of currentNode.successors.entries()) {
			const targetId = getUniqueNodeId(successorNode)
			const label = getActionLabel(action)
			const edge = label
				? `  ${sourceId} -- ${label} --> ${targetId}`
				: `  ${sourceId} --> ${targetId}`
			edges.add(edge)

			if (!visited.has(successorNode)) {
				visited.add(successorNode)
				queue.push(successorNode)
			}
		}
	}

	const mermaidLines = [
		'graph TD',
		...Array.from(nodes),
		...Array.from(edges),
	]

	return mermaidLines.join('\n')
}

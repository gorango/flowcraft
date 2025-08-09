import type { WorkflowBlueprint } from '../builder/graph/types'
import type { AbstractNode, Flow } from '../workflow'
import { DEFAULT_ACTION, FILTER_FAILED } from '../types'

/**
 * Converts a special action symbol to a user-friendly string for the graph label.
 * @param action The action symbol or string.
 * @returns A string label for the Mermaid edge.
 */
function getActionLabel(action: string | symbol): string {
	if (action === DEFAULT_ACTION)
		return ''

	if (action === FILTER_FAILED)
		return '"filter failed"'

	// Sanitize labels to prevent breaking Mermaid syntax
	const sanitizedAction = action.toString().replace(/"/g, '')
	return `"${sanitizedAction}"`
}

/**
 * Generates a descriptive label for a node to be used in the Mermaid graph.
 * @param node The node to generate a label for.
 * @param uniqueId The unique ID assigned to this node instance in the graph.
 * @returns A formatted string for the Mermaid node definition.
 */
function getNodeLabel(node: AbstractNode, uniqueId: string): string {
	if ((node as any).isParallelContainer)
		return `  ${uniqueId}{Parallel Block}`

	if (node.constructor.name === 'InputMappingNode')
		return `  ${uniqueId}(("Inputs"))`

	if (node.constructor.name === 'OutputMappingNode')
		return `  ${uniqueId}(("Outputs"))`

	if (node.graphData) {
		const type = node.graphData.type
		const id = node.graphData.id.split(':').pop()
		return `  ${uniqueId}["${id} (${type})"]`
	}

	return `  ${uniqueId}[${node.constructor.name}]`
}

/**
 * Generates a unique, readable ID for a node instance.
 * @param node The node instance.
 * @returns A unique string ID.
 */
function getUniqueNodeId(node: AbstractNode, nameCounts: Map<string, number>, idMap: Map<AbstractNode, string>): string {
	if (idMap.has(node))
		return idMap.get(node)!

	let baseName: string
	if ((node as any).isParallelContainer) {
		baseName = 'ParallelBlock'
	}
	else if (node.graphData) {
		baseName = node.graphData.id
	}
	else if (node.id) {
		baseName = String(node.id)
	}
	else {
		baseName = node.constructor.name
	}

	// Sanitize the name for Mermaid ID
	const sanitizedBaseName = baseName.replace(/:/g, '_').replace(/\W/g, '')
	const count = nameCounts.get(sanitizedBaseName) || 0
	const uniqueId = `${sanitizedBaseName}_${count}`
	nameCounts.set(sanitizedBaseName, count + 1)
	idMap.set(node, uniqueId)
	return uniqueId
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
 * const startNode = new Node('start')
 * const processNode = new Node('process')
 * const endNode = new Node('end')
 *
 * startNode.next(processNode)
 * processNode.next(endNode)
 *
 * const myFlow = new Flow(startNode)
 * const mermaidSyntax = generateMermaidGraph(myFlow)
 * console.log(mermaidSyntax)
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

	visited.add(flow.startNode)
	getUniqueNodeId(flow.startNode, nameCounts, idMap)

	while (queue.length > 0) {
		const currentNode = queue.shift()!
		const sourceId = getUniqueNodeId(currentNode, nameCounts, idMap)

		nodes.add(getNodeLabel(currentNode, sourceId))

		if ((currentNode as any).isParallelContainer) {
			const container = currentNode as any as { nodesToRun: AbstractNode[] }
			for (const internalNode of container.nodesToRun) {
				const targetId = getUniqueNodeId(internalNode, nameCounts, idMap)
				edges.add(`  ${sourceId} --> ${targetId}`)
				if (!visited.has(internalNode)) {
					visited.add(internalNode)
					queue.push(internalNode)
				}
			}
		}

		for (const [action, successorNodes] of currentNode.successors.entries()) {
			for (const successorNode of successorNodes) {
				const targetId = getUniqueNodeId(successorNode, nameCounts, idMap)
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
	}

	const mermaidLines = [
		'graph TD',
		...Array.from(nodes),
		...Array.from(edges),
	]

	return mermaidLines.join('\n')
}

/**
 * Generates a Mermaid graph definition from a static `WorkflowBlueprint`.
 *
 * This utility iterates over the blueprint's nodes and edges to output a string
 * that can be rendered by Mermaid.js to visualize the entire workflow structure.
 *
 * @param blueprint The `WorkflowBlueprint` instance to visualize.
 * @returns A string containing the Mermaid `graph TD` definition.
 */
export function generateMermaidFromBlueprint(blueprint: WorkflowBlueprint): string {
	let mermaidString = 'graph TD\n'

	// Define nodes, quoting the ID to handle special characters and adding the type as a label
	for (const node of blueprint.nodes) {
		const label = `${node.id.replace(/"/g, '#quot;')} (${node.type})`
		mermaidString += `    ${node.id}["${label}"]\n`
	}

	mermaidString += '\n'

	// Define edges, adding the action as a label if it exists
	for (const edge of blueprint.edges) {
		if (edge.action) {
			mermaidString += `    ${edge.source} -->|${String(edge.action)}| ${edge.target}\n`
		}
		else {
			mermaidString += `    ${edge.source} --> ${edge.target}\n`
		}
	}

	return mermaidString
}

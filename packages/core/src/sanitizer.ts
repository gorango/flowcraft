import type { EdgeDefinition, NodeDefinition, WorkflowBlueprint } from './types'

/**
 * Sanitizes a raw workflow blueprint by removing extra properties
 * added by UI tools (e.g., position, style) and keeping only the
 * properties defined in NodeDefinition and EdgeDefinition.
 */
export function sanitizeBlueprint(raw: any): WorkflowBlueprint {
	let nodesArray: any[] = []
	if (Array.isArray(raw.nodes)) {
		nodesArray = raw.nodes
	} else if (typeof raw.nodes === 'object' && raw.nodes !== null) {
		nodesArray = Object.values(raw.nodes)
	}

	const nodes: NodeDefinition[] = nodesArray.map((node: any) => ({
		id: node.id,
		uses: node.uses,
		params: node.params,
		inputs: node.inputs,
		config: node.config,
	}))

	let edgesArray: any[] = []
	if (Array.isArray(raw.edges)) {
		edgesArray = raw.edges
	} else if (typeof raw.edges === 'object' && raw.edges !== null) {
		edgesArray = Object.values(raw.edges)
	}

	const edges: EdgeDefinition[] = edgesArray.map((edge: any) => ({
		source: edge.source,
		target: edge.target,
		action: edge.action,
		condition: edge.condition,
		transform: edge.transform,
	}))

	return {
		id: raw.id,
		nodes,
		edges,
		metadata: raw.metadata,
	}
}

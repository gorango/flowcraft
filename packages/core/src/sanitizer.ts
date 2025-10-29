import type { EdgeDefinition, NodeDefinition, WorkflowBlueprint } from './types'

/**
 * Sanitizes a raw workflow blueprint by removing extra properties
 * added by UI tools (e.g., position, style) and keeping only the
 * properties defined in NodeDefinition and EdgeDefinition.
 * Also prevents prototype pollution attacks.
 */
export function sanitizeBlueprint(raw: any): WorkflowBlueprint {
	let nodes: NodeDefinition[] = []

	const processNode = (node: any): NodeDefinition | null => {
		if (!node.id || typeof node.id !== 'string' || node.id.trim() === '') {
			return null
		}
		const cleanNode: any = {}
		if (node.id !== undefined) cleanNode.id = node.id
		if (node.uses !== undefined) cleanNode.uses = node.uses
		if (node.params !== undefined) cleanNode.params = node.params
		if (node.inputs !== undefined) cleanNode.inputs = node.inputs
		if (node.config !== undefined) cleanNode.config = node.config
		return cleanNode
	}

	if (Array.isArray(raw.nodes)) {
		nodes = raw.nodes.map(processNode).filter((n: NodeDefinition | null) => n !== null) as NodeDefinition[]
	} else if (raw.nodes && typeof raw.nodes === 'object') {
		nodes = Object.values(raw.nodes)
			.map(processNode)
			.filter((n: NodeDefinition | null) => n !== null) as NodeDefinition[]
	}

	let edges: EdgeDefinition[] = []

	if (Array.isArray(raw.edges)) {
		edges = raw.edges.map((edge: any) => {
			const cleanEdge: any = {}
			if (edge.source !== undefined) cleanEdge.source = edge.source
			if (edge.target !== undefined) cleanEdge.target = edge.target
			if (edge.action !== undefined) cleanEdge.action = edge.action
			if (edge.condition !== undefined) cleanEdge.condition = edge.condition
			if (edge.transform !== undefined) cleanEdge.transform = edge.transform
			return cleanEdge
		})
	}

	return {
		id: raw.id,
		nodes,
		edges,
		metadata: raw.metadata,
	}
}

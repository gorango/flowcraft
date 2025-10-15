import type { EdgeDefinition, NodeDefinition, WorkflowBlueprint } from './types'

/**
 * Sanitizes a raw workflow blueprint by removing extra properties
 * added by UI tools (e.g., position, style) and keeping only the
 * properties defined in NodeDefinition and EdgeDefinition.
 */
export function sanitizeBlueprint(raw: any): WorkflowBlueprint {
	const nodes: NodeDefinition[] =
		raw.nodes?.map((node: any) => ({
			id: node.id,
			uses: node.uses,
			params: node.params,
			inputs: node.inputs,
			config: node.config,
		})) || []

	const edges: EdgeDefinition[] =
		raw.edges?.map((edge: any) => ({
			source: edge.source,
			target: edge.target,
			action: edge.action,
			condition: edge.condition,
			transform: edge.transform,
		})) || []

	return {
		id: raw.id,
		nodes,
		edges,
		metadata: raw.metadata,
	}
}

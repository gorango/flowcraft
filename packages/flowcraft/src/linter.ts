import type { NodeClass, NodeFunction, WorkflowBlueprint } from './types'
import { analyzeBlueprint } from './analysis'

export type LinterIssueCode = | 'INVALID_EDGE_SOURCE'
	| 'INVALID_EDGE_TARGET'
	| 'MISSING_NODE_IMPLEMENTATION'
	| 'ORPHAN_NODE'

export interface LinterIssue {
	code: LinterIssueCode
	message: string
	nodeId?: string
	relatedId?: string
}

export interface LinterResult {
	isValid: boolean
	issues: LinterIssue[]
}

/**
 * Statically analyzes a workflow blueprint against a registry of implementations
 * to find common errors before runtime.
 *
 * @param blueprint The WorkflowBlueprint to analyze.
 * @param registry A map of node implementations (functions or classes) to check against.
 * @returns A LinterResult object containing any issues found.
 */
export function lintBlueprint(
	blueprint: WorkflowBlueprint,
	registry: Map<string, NodeFunction | NodeClass> | Record<string, NodeFunction | NodeClass>,
): LinterResult {
	const issues: LinterIssue[] = []
	const nodeIds = new Set(blueprint.nodes.map(n => n.id))
	const registryKeys = registry instanceof Map ? new Set(registry.keys()) : new Set(Object.keys(registry))

	// 1. Check for missing node implementations
	for (const node of blueprint.nodes) {
		if (!node.uses.startsWith('batch-') && !node.uses.startsWith('loop-') && !registryKeys.has(node.uses)) {
			issues.push({
				code: 'MISSING_NODE_IMPLEMENTATION',
				message: `Node implementation key '${node.uses}' is not found in the provided registry.`,
				nodeId: node.id,
			})
		}
	}

	// 2. Check for graph integrity (edges must point to valid nodes)
	for (const edge of blueprint.edges || []) {
		if (!nodeIds.has(edge.source)) {
			issues.push({
				code: 'INVALID_EDGE_SOURCE',
				message: `Edge source '${edge.source}' does not correspond to a valid node ID.`,
				relatedId: edge.target,
			})
		}
		if (!nodeIds.has(edge.target)) {
			issues.push({
				code: 'INVALID_EDGE_TARGET',
				message: `Edge target '${edge.target}' does not correspond to a valid node ID.`,
				relatedId: edge.source,
			})
		}
	}

	// 3. Check for orphan nodes (not connected to the main graph)
	if (blueprint.nodes.length > 1) {
		const analysis = analyzeBlueprint(blueprint)
		const connectedNodes = new Set<string>()
		const nodesToVisit = [...analysis.startNodeIds]
		const visited = new Set<string>()

		while (nodesToVisit.length > 0) {
			const currentId = nodesToVisit.pop()!
			if (visited.has(currentId))
				continue

			visited.add(currentId)
			connectedNodes.add(currentId)

			blueprint.edges
				.filter(e => e.source === currentId)
				.forEach(e => nodesToVisit.push(e.target))
		}

		for (const nodeId of nodeIds) {
			if (!connectedNodes.has(nodeId)) {
				issues.push({
					code: 'ORPHAN_NODE',
					message: `Node '${nodeId}' is not reachable from any start node.`,
					nodeId,
				})
			}
		}
	}

	return {
		isValid: issues.length === 0,
		issues,
	}
}

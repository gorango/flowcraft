import { FlowcraftError } from './errors'
import type { SourceLocation, WorkflowBlueprint } from './types'

/**
 * Creates an error mapper function that enhances runtime errors with source location information.
 * The mapper looks up node IDs in the provided manifest blueprints and returns enhanced errors
 * that point to the original TypeScript source code.
 *
 * @param manifestBlueprints - The compiled blueprint manifest containing source location data
 * @returns A function that maps errors to enhanced errors with source location information
 */
export function createErrorMapper(manifestBlueprints: Record<string, WorkflowBlueprint>) {
	const locationMap = new Map<string, SourceLocation>()

	// Pre-process the manifest to build a quick lookup map
	for (const blueprint of Object.values(manifestBlueprints)) {
		for (const node of blueprint.nodes) {
			if (node._sourceLocation) {
				locationMap.set(node.id, node._sourceLocation)
			}
		}
		for (const edge of blueprint.edges) {
			if (edge._sourceLocation) {
				// Use a compound key for edges: source-target
				const edgeKey = `${edge.source}-${edge.target}`
				locationMap.set(edgeKey, edge._sourceLocation)
			}
		}
	}

	return function mapError(error: Error): Error {
		// Check if it's a FlowcraftError with a nodeId
		if (error instanceof FlowcraftError && error.nodeId) {
			const location = locationMap.get(error.nodeId)
			if (location) {
				return new Error(
					`Workflow error at ${location.file}:${location.line}:${location.column}. Original error: ${error.message}`,
				)
			}
		}

		// Fallback: try to extract nodeId from error message using regex
		const nodeIdMatch = error.message.match(/nodeId[:\s]+([^\s,]+)/i)
		if (nodeIdMatch) {
			const nodeId = nodeIdMatch[1]
			const location = locationMap.get(nodeId)
			if (location) {
				return new Error(
					`Workflow error at ${location.file}:${location.line}:${location.column}. Original error: ${error.message}`,
				)
			}
		}

		// Return original error if no mapping found
		return error
	}
}

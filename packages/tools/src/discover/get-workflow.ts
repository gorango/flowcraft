import { z } from 'zod'
import type { WorkflowTool, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'

const getWorkflowSchema = z.object({
	workflowId: z.string().describe('The workflow blueprint ID'),
	version: z.string().optional().describe('Blueprint version (defaults to latest)'),
	includeBlueprint: z
		.boolean()
		.optional()
		.default(false)
		.describe('Include the full blueprint definition'),
})

export function createGetWorkflowTool(config: {
	resolver: BlueprintResolver
}): WorkflowTool<typeof getWorkflowSchema> {
	return createWorkflowTool({
		name: 'get_workflow',
		description: 'Get details about a specific workflow blueprint by ID',
		parameters: getWorkflowSchema,
		execute: async (params) => {
			const start = Date.now()

			try {
				const { blueprint, version } = await config.resolver.resolve({
					id: params.workflowId,
					version: params.version,
				})

				return {
					status: 'completed',
					data: {
						id: blueprint.id,
						version,
						metadata: blueprint.metadata,
						nodeCount: blueprint.nodes.length,
						edgeCount: blueprint.edges.length,
						blueprint: params.includeBlueprint ? blueprint : undefined,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: blueprint.nodes.map((n) => n.id),
						blueprintId: blueprint.id,
						blueprintVersion: version,
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: params.workflowId,
					},
				}
			}
		},
	})
}

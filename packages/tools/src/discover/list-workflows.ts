import { z } from 'zod'
import type { WorkflowTool, BlueprintResolver, BlueprintDatabase } from '../types'
import { createWorkflowTool } from '../tool'

const listWorkflowsSchema = z.object({
	limit: z.number().optional().default(50).describe('Maximum number of workflows to return'),
	offset: z.number().optional().default(0).describe('Offset for pagination'),
})

export function createListWorkflowsTool(config: {
	resolver: BlueprintDatabase | BlueprintResolver
}): WorkflowTool<typeof listWorkflowsSchema> {
	return createWorkflowTool({
		name: 'list_workflows',
		description: 'List available workflow blueprints with their IDs, versions, and metadata',
		parameters: listWorkflowsSchema,
		triggers: [
			'list workflows',
			'show workflows',
			'all workflows',
			'browse workflows',
			'available workflows',
		],
		execute: async (params) => {
			const start = Date.now()

			try {
				if ('list' in config.resolver) {
					const workflows = await config.resolver.list({
						limit: params.limit,
						offset: params.offset,
					})

					return {
						status: 'completed',
						data: { workflows, total: workflows.length },
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: '',
						},
					}
				}

				return {
					status: 'completed',
					data: { workflows: [], note: 'Resolver does not support listing' },
					metadata: { duration: Date.now() - start, affectedNodes: [], blueprintId: '' },
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: { duration: Date.now() - start, affectedNodes: [], blueprintId: '' },
				}
			}
		},
	})
}

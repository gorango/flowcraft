import { z } from 'zod'
import type { WorkflowTool, BlueprintGeneratorFn } from '../types'
import { createWorkflowTool } from '../tool'

const nodeSchema = z.object({
	id: z.string(),
	purpose: z.string(),
	inputs: z.array(z.string()).optional(),
})

const createBlueprintSchema = z.object({
	description: z.string().describe('What the workflow should do'),
	nodes: z.array(nodeSchema).optional().describe('Suggested node structure'),
})

export function createCreateBlueprintTool(config: {
	generate: BlueprintGeneratorFn
}): WorkflowTool<typeof createBlueprintSchema> {
	return createWorkflowTool({
		name: 'create_workflow',
		description:
			'Generate a workflow blueprint from a natural language description of what the workflow should do',
		parameters: createBlueprintSchema,
		triggers: [
			'create workflow',
			'new workflow',
			'design workflow',
			'build pipeline',
			'generate blueprint',
			'author flow',
		],
		execute: async (params) => {
			const start = Date.now()
			try {
				const blueprint = await config.generate(params)
				return {
					status: 'completed',
					data: { blueprint },
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: blueprint.id,
						blueprintVersion: blueprint.metadata?.version,
					},
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

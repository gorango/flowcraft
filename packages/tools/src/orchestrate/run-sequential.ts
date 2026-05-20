import { z } from 'zod'
import type { WorkflowTool, FlowcraftRuntime, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'

const runWorkflowsSequentialSchema = z.object({
	workflows: z
		.array(
			z.object({
				workflowId: z.string(),
				version: z.string().optional(),
				params: z.record(z.string(), z.unknown()).optional(),
			}),
		)
		.min(1)
		.describe('Workflows to run in sequence'),
	stopOnFailure: z.boolean().optional().default(true),
})

export function createRunWorkflowsSequentialTool(config: {
	resolver: BlueprintResolver
	runtime: FlowcraftRuntime
}): WorkflowTool<typeof runWorkflowsSequentialSchema> {
	return createWorkflowTool({
		name: 'run_workflows_sequential',
		description:
			'Run multiple workflow blueprints in sequence, optionally passing context between them',
		parameters: runWorkflowsSequentialSchema,
		execute: async (params) => {
			const start = Date.now()
			const results: Array<Record<string, unknown>> = []
			let previousContext: Record<string, unknown> = {}

			try {
				for (const spec of params.workflows) {
					const { blueprint, version } = await config.resolver.resolve({
						id: spec.workflowId,
						version: spec.version,
					})

					const mergedParams = { ...previousContext, ...spec.params }
					const result = await config.runtime.run(blueprint, mergedParams)
					const ctx = result.context
					previousContext = ctx

					results.push({
						workflowId: spec.workflowId,
						version: version ?? blueprint.metadata?.version,
						status: result.status,
						context: ctx,
						executionId: ctx._executionId,
					})

					if (result.status === 'failed' && params.stopOnFailure) {
						return {
							status: 'failed',
							data: { results, failedAt: spec.workflowId },
							error: {
								message: `Workflow '${spec.workflowId}' failed, stopping sequence`,
							},
							metadata: {
								duration: Date.now() - start,
								affectedNodes: [],
								blueprintId: spec.workflowId,
							},
						}
					}
				}

				return {
					status: 'completed',
					data: { results, totalDuration: Date.now() - start },
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: params.workflows[params.workflows.length - 1].workflowId,
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: '',
					},
				}
			}
		},
	})
}

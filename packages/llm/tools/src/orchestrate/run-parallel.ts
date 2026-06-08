import { z } from 'zod'
import type { WorkflowTool, FlowcraftRuntime, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'

const runWorkflowsParallelSchema = z.object({
	workflows: z
		.array(
			z.object({
				workflowId: z.string(),
				version: z.string().optional(),
				params: z.record(z.string(), z.unknown()).optional(),
			}),
		)
		.min(1)
		.max(20)
		.describe('Workflows to run in parallel'),
})

export function createRunWorkflowsParallelTool(config: {
	resolver: BlueprintResolver
	runtime: FlowcraftRuntime
}): WorkflowTool<typeof runWorkflowsParallelSchema> {
	return createWorkflowTool({
		name: 'run_workflows_parallel',
		description: 'Run multiple workflow blueprints concurrently for maximum throughput',
		parameters: runWorkflowsParallelSchema,
		triggers: [
			'run in parallel',
			'fan out',
			'concurrent workflows',
			'parallel run',
			'run concurrently',
		],
		execute: async (params) => {
			const start = Date.now()

			try {
				const promises = params.workflows.map(async (spec) => {
					const { blueprint, version } = await config.resolver.resolve({
						id: spec.workflowId,
						version: spec.version,
					})

					const result = await config.runtime.run(blueprint, spec.params ?? {})
					const ctx = result.context

					return {
						workflowId: spec.workflowId,
						version: version ?? blueprint.metadata?.version,
						status: result.status,
						context: ctx,
						executionId: ctx._executionId,
					}
				})

				const results = await Promise.all(promises)

				const allCompleted = results.every((r) => r.status === 'completed')
				const failed = results.filter((r) => r.status === 'failed')

				return {
					status: allCompleted ? 'completed' : 'failed',
					data: {
						results,
						successCount: results.filter((r) => r.status === 'completed').length,
						failureCount: failed.length,
						totalDuration: Date.now() - start,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: params.workflows[0].workflowId,
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

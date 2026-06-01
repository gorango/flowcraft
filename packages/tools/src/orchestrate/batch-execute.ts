import { z } from 'zod'
import type { WorkflowTool, FlowcraftRuntime, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'

const batchExecuteSchema = z.object({
	workflowId: z.string().describe('The workflow to batch'),
	version: z.string().optional(),
	paramsList: z
		.array(z.record(z.string(), z.unknown()))
		.min(1)
		.max(100)
		.describe('Array of param sets, one per execution'),
	maxConcurrency: z.number().optional().default(5).describe('Max concurrent executions'),
	timeout: z.number().optional().describe('Maximum total time for all executions in ms'),
})

export function createBatchExecuteTool(config: {
	resolver: BlueprintResolver
	runtime: FlowcraftRuntime
}): WorkflowTool<typeof batchExecuteSchema> {
	return createWorkflowTool({
		name: 'batch_execute',
		description:
			'Execute the same workflow blueprint multiple times with different parameter sets',
		parameters: batchExecuteSchema,
		triggers: ['batch', 'bulk execute', 'for each', 'map over inputs', 'run many'],
		execute: async (params) => {
			const start = Date.now()

			try {
				const { blueprint, version } = await config.resolver.resolve({
					id: params.workflowId,
					version: params.version,
				})

				const results: Array<{
					executionId: string
					status: string
					params: Record<string, unknown>
					context?: Record<string, unknown>
					error?: string
				}> = []

				const maxConcurrency = params.maxConcurrency
				for (let i = 0; i < params.paramsList.length; i += maxConcurrency) {
					if (params.timeout && Date.now() - start > params.timeout) {
						const remaining = params.paramsList.length - i
						results.push(
							...Array.from({ length: remaining }, (_, j) => ({
								executionId: `batch_timeout_${i + j}`,
								status: 'failed',
								params: params.paramsList[i + j],
								error: 'Batch execution timed out',
							})),
						)
						break
					}

					const batch = params.paramsList.slice(i, i + maxConcurrency)
					const batchPromises = batch.map(async (batchParams) => {
						try {
							const result = await config.runtime.run(blueprint, batchParams)
							const ctx = result.context
							const executionId = ctx._executionId ?? crypto.randomUUID()
							return {
								executionId,
								status: result.status,
								params: batchParams,
								context: ctx,
							}
						} catch (error) {
							return {
								executionId: `batch_error_${crypto.randomUUID().slice(0, 8)}`,
								status: 'failed',
								params: batchParams,
								error: error instanceof Error ? error.message : String(error),
							}
						}
					})

					const batchResults = await Promise.all(batchPromises)
					results.push(...batchResults)
				}

				const completed = results.filter((r) => r.status === 'completed')
				const failed = results.filter((r) => r.status === 'failed')

				return {
					status: failed.length === 0 ? 'completed' : 'failed',
					data: {
						workflowId: params.workflowId,
						version,
						totalInputs: params.paramsList.length,
						completedCount: completed.length,
						failureCount: failed.length,
						results,
						totalDuration: Date.now() - start,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
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

import { z } from 'zod'
import type {
	WorkflowTool,
	FlowcraftRuntime,
	BlueprintResolver,
	AsyncExecutionStore,
} from '../types'
import { createWorkflowTool } from '../tool'

const runWorkflowSchema = z.object({
	workflowId: z.string().describe('The workflow blueprint ID to execute'),
	version: z.string().optional().describe('Blueprint version (defaults to latest)'),
	params: z
		.record(z.string(), z.unknown())
		.describe('Initial context data for the workflow')
		.default({}),
	mode: z
		.enum(['sync', 'async'])
		.optional()
		.default('sync')
		.describe('sync waits for completion, async returns executionId immediately'),
})

export function createRunWorkflowTool(config: {
	resolver: BlueprintResolver
	runtime: FlowcraftRuntime
	asyncStore?: AsyncExecutionStore
}): WorkflowTool<typeof runWorkflowSchema> {
	return createWorkflowTool({
		name: 'run_workflow',
		description:
			'Execute a workflow by ID with the given parameters. Use sync mode to wait for completion, or async to start in the background.',
		parameters: runWorkflowSchema,
		triggers: [
			'run',
			'execute',
			'start',
			'kick off',
			'launch workflow',
			'begin execution',
			'run the workflow',
		],
		execute: async (params) => {
			const start = Date.now()
			const executionId = crypto.randomUUID()

			try {
				const { blueprint, version } = await config.resolver.resolve({
					id: params.workflowId,
					version: params.version,
				})

				if (params.mode === 'async' && config.asyncStore) {
					const runFn = async () => {
						const result = await config.runtime.run(blueprint, params.params)
						const duration = Date.now() - start
						const ctx = result.context
						return {
							status: result.status as 'completed' | 'failed' | 'awaiting',
							data: ctx,
							executionId,
							awaitingNodeIds: result.context._awaitingNodeIds,
							awaitingDetails: result.context._awaitingDetails,
							metadata: {
								duration,
								affectedNodes: Object.keys(ctx._outputs || {}),
								blueprintId: blueprint.id,
								blueprintVersion: version,
							},
						}
					}

					config.asyncStore.start(executionId, runFn)

					return {
						status: 'started',
						executionId,
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: blueprint.id,
							blueprintVersion: version,
						},
					}
				}

				const result = await config.runtime.run(blueprint, params.params)
				const duration = Date.now() - start
				const ctx = result.context

				return {
					status: result.status as 'completed' | 'failed' | 'awaiting',
					data: ctx,
					executionId: result.context._executionId ?? executionId,
					awaitingNodeIds: result.context._awaitingNodeIds,
					awaitingDetails: result.context._awaitingDetails,
					metadata: {
						duration,
						affectedNodes: Object.keys(ctx._outputs || {}),
						blueprintId: blueprint.id,
						blueprintVersion: version,
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					executionId,
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

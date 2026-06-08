import { z } from 'zod'
import type { WorkflowTool, FlowcraftRuntime, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'

const requestApprovalSchema = z.object({
	executionId: z.string().optional().describe('The execution ID to request approval for'),
	workflowId: z
		.string()
		.optional()
		.describe('Blueprint ID to start a new approval-gated execution'),
	version: z.string().optional().describe('Blueprint version'),
	reason: z.string().describe('Why approval is needed'),
})

export function createRequestApprovalTool(config: {
	runtime: FlowcraftRuntime
	resolver: BlueprintResolver
}): WorkflowTool<typeof requestApprovalSchema> {
	return createWorkflowTool({
		name: 'request_approval',
		description:
			'Request human approval for a workflow execution, pausing it until approval is granted',
		parameters: requestApprovalSchema,
		triggers: [
			'request approval',
			'human approval',
			'ask for approval',
			'need signoff',
			'request signoff',
		],
		execute: async (params) => {
			const start = Date.now()

			try {
				if (params.executionId) {
					config.runtime.requestPause(params.executionId)

					return {
						status: 'completed',
						data: {
							approvalRequested: true,
							executionId: params.executionId,
							reason: params.reason,
						},
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: '',
						},
					}
				}

				if (params.workflowId) {
					const { blueprint, version: resolvedVersion } = await config.resolver.resolve({
						id: params.workflowId,
						version: params.version,
					})

					const result = await config.runtime.run(blueprint, {})
					const ctx = result.context

					return {
						status: 'awaiting',
						data: {
							approvalRequested: true,
							reason: params.reason,
							context: ctx,
						},
						executionId: ctx._executionId as string | undefined,
						awaitingNodeIds: result.context._awaitingNodeIds,
						awaitingDetails: result.context._awaitingDetails,
						metadata: {
							duration: Date.now() - start,
							affectedNodes: Object.keys((ctx._outputs as Record<string, unknown>) ?? {}),
							blueprintId: blueprint.id,
							blueprintVersion: resolvedVersion,
						},
					}
				}

				return {
					status: 'failed',
					error: { message: 'Either executionId or workflowId must be provided' },
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: '',
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: params.workflowId ?? '',
					},
				}
			}
		},
	})
}

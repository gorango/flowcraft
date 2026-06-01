import { z } from 'zod'
import type { WorkflowTool } from '../types'
import { createWorkflowTool } from '../tool'

const cancelWorkflowSchema = z.object({
	executionId: z.string().describe('The execution to cancel'),
	reason: z.string().optional().describe('Reason for cancellation'),
})

export function createCancelWorkflowTool(config: {
	controllers: Map<string, AbortController>
}): WorkflowTool<typeof cancelWorkflowSchema> {
	return createWorkflowTool({
		name: 'cancel_workflow',
		description: 'Cancel a running workflow by execution ID',
		parameters: cancelWorkflowSchema,
		triggers: ['cancel', 'abort', 'stop', 'kill', 'terminate', 'cancel execution'],
		execute: async (params) => {
			const start = Date.now()
			const controller = config.controllers.get(params.executionId)

			if (!controller) {
				return {
					status: 'failed',
					error: { message: `No active execution found for ${params.executionId}` },
					executionId: params.executionId,
					metadata: { duration: Date.now() - start, affectedNodes: [], blueprintId: '' },
				}
			}

			controller.abort(params.reason ?? 'Cancelled by user')
			config.controllers.delete(params.executionId)

			return {
				status: 'completed',
				data: { cancelled: true, reason: params.reason },
				executionId: params.executionId,
				metadata: { duration: Date.now() - start, affectedNodes: [], blueprintId: '' },
			}
		},
	})
}

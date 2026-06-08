import { z } from 'zod'
import type { WorkflowTool, FlowcraftRuntime } from '../types'
import { createWorkflowTool } from '../tool'

const pauseWorkflowSchema = z.object({
	executionId: z.string().describe('The execution ID to pause'),
	reason: z.string().optional().describe('Reason for the pause'),
})

export function createPauseWorkflowTool(config: {
	runtime: FlowcraftRuntime
}): WorkflowTool<typeof pauseWorkflowSchema> {
	return createWorkflowTool({
		name: 'pause_workflow',
		description: 'Pause a running workflow execution at the next safe checkpoint',
		parameters: pauseWorkflowSchema,
		triggers: ['pause', 'hold', 'suspend', 'pause execution'],
		execute: async (params) => {
			const start = Date.now()

			try {
				config.runtime.requestPause(params.executionId)

				return {
					status: 'completed',
					data: {
						paused: true,
						executionId: params.executionId,
						reason: params.reason ?? 'Manual pause requested',
					},
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
					metadata: { duration: Date.now() - start, affectedNodes: [], blueprintId: '' },
				}
			}
		},
	})
}

import { z } from 'zod'
import type { WorkflowTool, EventStore } from '../types'
import { createWorkflowTool } from '../tool'

const checkStatusSchema = z.object({
	executionId: z.string().describe('The execution to check'),
})

export function createCheckStatusTool(config: {
	eventStore: EventStore
}): WorkflowTool<typeof checkStatusSchema> {
	return createWorkflowTool({
		name: 'check_workflow_status',
		description: 'Check the current status of a running or completed workflow execution',
		parameters: checkStatusSchema,
		execute: async (params) => {
			const start = Date.now()

			try {
				const events = await config.eventStore.retrieve(params.executionId)
				const typedEvents = events as Array<Record<string, unknown>>

				if (typedEvents.length === 0) {
					return {
						status: 'failed',
						error: { message: `No events found for execution ${params.executionId}` },
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: '',
						},
					}
				}

				const startEvent = typedEvents.find((e) => e.type === 'workflow:start')
				const finishEvent = typedEvents.find((e) => e.type === 'workflow:finish')
				const stallEvent = typedEvents.find((e) => e.type === 'workflow:stall')
				const pauseEvent = typedEvents.find((e) => e.type === 'workflow:pause')
				const errorEvents = typedEvents.filter((e) => e.type === 'node:error')
				const nodeFinishEvents = typedEvents.filter((e) => e.type === 'node:finish')

				let status: 'completed' | 'failed' | 'awaiting' | 'started' = 'started'
				if (finishEvent) status = 'completed'
				else if (stallEvent) status = 'failed'
				else if (pauseEvent) status = 'awaiting'

				const nodeIds = nodeFinishEvents.map((e) => e.nodeId as string)

				return {
					status,
					data: {
						eventCount: typedEvents.length,
						nodesCompleted: nodeIds,
						errorCount: errorEvents.length,
					},
					executionId: params.executionId,
					metadata: {
						duration: Date.now() - start,
						affectedNodes: nodeIds,
						blueprintId: (startEvent?.blueprintId as string) ?? '',
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					executionId: params.executionId,
					metadata: { duration: Date.now() - start, affectedNodes: [], blueprintId: '' },
				}
			}
		},
	})
}

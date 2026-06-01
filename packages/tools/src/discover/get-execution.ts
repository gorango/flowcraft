import { z } from 'zod'
import type { WorkflowTool, EventStore } from '../types'
import { createWorkflowTool } from '../tool'

const getExecutionSchema = z.object({
	executionId: z.string().describe('The execution ID to inspect'),
})

export function createGetExecutionTool(config: {
	eventStore: EventStore
}): WorkflowTool<typeof getExecutionSchema> {
	return createWorkflowTool({
		name: 'get_execution',
		description:
			'Get detailed information about a specific workflow execution including events and final state',
		parameters: getExecutionSchema,
		triggers: ['get execution', 'execution details', 'show execution', 'inspect execution'],
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
				const errorEvents = typedEvents.filter((e) => e.type === 'node:error')
				const nodeEvents = typedEvents.filter((e) => e.type === 'node:finish')

				const contextState: Record<string, unknown> = {}
				for (const event of typedEvents.filter((e) => e.type === 'context:change')) {
					if (event.key && event.value !== undefined) {
						contextState[event.key as string] = event.value
					}
				}

				const status = finishEvent ? (finishEvent.status ?? 'completed') : 'running'

				return {
					status: status === 'completed' ? 'completed' : 'started',
					data: {
						executionId: params.executionId,
						blueprintId: startEvent?.blueprintId,
						status,
						eventCount: typedEvents.length,
						nodesCompleted: nodeEvents.map((e) => e.nodeId),
						errors: errorEvents.map((e) => ({
							nodeId: e.nodeId,
							message: e.error,
						})),
						finalContext: contextState,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: nodeEvents.map((e) => e.nodeId as string),
						blueprintId: (startEvent?.blueprintId as string) ?? '',
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

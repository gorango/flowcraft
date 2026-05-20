import { z } from 'zod'
import type { WorkflowTool, EventStore } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import {
	reconstructContext,
	getExecutionStatus,
	getCompletedNodes,
	getNodeErrors,
} from '../utils/events'

const getExecutionContextSchema = z.object({
	executionId: z.string().describe('The execution ID'),
	includeHistory: z
		.boolean()
		.optional()
		.default(false)
		.describe('Include full context:change history'),
})

export function createGetExecutionContextTool(config: {
	eventStore: EventStore
}): WorkflowTool<typeof getExecutionContextSchema> {
	return createWorkflowTool({
		name: 'get_execution_context',
		description:
			'Retrieve the full context state of a workflow execution, reconstructed from events',
		parameters: getExecutionContextSchema,
		execute: async (params) => {
			const start = Date.now()

			try {
				const events = await config.eventStore.retrieve(params.executionId)
				const typedEvents = events as unknown[]

				if (typedEvents.length === 0) {
					return {
						status: 'failed',
						error: {
							message: `No events found for execution ${params.executionId}`,
							code: ErrorCodes.EXECUTION_NOT_FOUND,
						},
						metadata: {
							duration: Date.now() - start,
							nodesExecuted: [],
							blueprintId: '',
						},
					}
				}

				const context = reconstructContext(typedEvents)
				const status = getExecutionStatus(typedEvents)
				const completedNodes = getCompletedNodes(typedEvents)
				const errors = getNodeErrors(typedEvents)

				const nodeOutputs: Record<string, unknown> = {}
				const outputs = context._outputs as Record<string, unknown> | undefined
				if (outputs) {
					for (const [nodeId, output] of Object.entries(outputs)) {
						nodeOutputs[nodeId] = output
					}
				}

				const result: Record<string, unknown> = {
					context,
					nodeOutputs,
					eventCount: typedEvents.length,
					executionStatus: status.status,
					nodesCompleted: completedNodes,
					errorCount: errors.length,
				}

				if (params.includeHistory) {
					const history: Array<{ key: string; value: unknown }> = []
					for (const event of typedEvents) {
						const e = event as Record<string, unknown>
						if (e.type === 'context:change' && e.key) {
							history.push({
								key: e.key as string,
								value: e.value,
							})
						}
					}
					result.changeHistory = history
				}

				return {
					status: 'completed',
					data: result,
					metadata: {
						duration: Date.now() - start,
						nodesExecuted: completedNodes,
						blueprintId: status.blueprintId ?? '',
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: {
						duration: Date.now() - start,
						nodesExecuted: [],
						blueprintId: '',
					},
				}
			}
		},
	})
}

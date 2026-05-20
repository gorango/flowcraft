import { z } from 'zod'
import type { WorkflowTool, EventStore } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import {
	getNodeErrors,
	getNodeRetryHistory,
	getExecutionStatus,
	getEventProp,
} from '../utils/events'

const getErrorDiagnosisSchema = z.object({
	executionId: z.string().describe('The execution ID'),
})

export function createGetErrorDiagnosisTool(config: {
	eventStore: EventStore
}): WorkflowTool<typeof getErrorDiagnosisSchema> {
	return createWorkflowTool({
		name: 'get_error_diagnosis',
		description:
			'Get AI-friendly error analysis including root cause classification and failure patterns',
		parameters: getErrorDiagnosisSchema,
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
							affectedNodes: [],
							blueprintId: '',
						},
					}
				}

				const status = getExecutionStatus(typedEvents)
				const allErrors = getNodeErrors(typedEvents)
				const uniqueErrors = [...new Map(allErrors.map((e) => [e.nodeId, e])).values()]
				const hasFallback = typedEvents.some(
					(e) => getEventProp<string>(e, 'type') === 'node:fallback',
				)

				const nodesWithErrors = uniqueErrors.map((err) => {
					const retries = getNodeRetryHistory(typedEvents, err.nodeId)
					const errorEvents = typedEvents.filter(
						(e) =>
							getEventProp<string>(e, 'type') === 'node:error' &&
							getEventProp<string>(e, 'nodeId') === err.nodeId,
					)
					const lastError = errorEvents[errorEvents.length - 1]
					const isFatal = lastError
						? getEventProp<Record<string, unknown>>(lastError, 'error')?.isFatal
						: undefined

					return {
						nodeId: err.nodeId,
						error: { message: err.message },
						retryAttempts: retries.length,
						fallbackExecuted: hasFallback,
						isFatal: isFatal as boolean | undefined,
					}
				})

				let errorPattern = 'no_errors'
				if (uniqueErrors.length === 1) errorPattern = 'single_node_failed'
				else if (uniqueErrors.length > 1) errorPattern = 'multiple_failures'
				if (hasFallback) errorPattern = 'fallback_based_recovery'

				return {
					status: 'completed',
					data: {
						hasErrors: uniqueErrors.length > 0,
						totalErrors: allErrors.length,
						nodesWithErrors,
						workflowStatus: status.status,
						errorPattern,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: nodesWithErrors.map((n) => n.nodeId),
						blueprintId: status.blueprintId ?? '',
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

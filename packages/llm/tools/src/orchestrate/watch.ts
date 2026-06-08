import { z } from 'zod'
import type { WorkflowTool, EventStore } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import { getExecutionStatus, getCompletedNodes, getNodeErrors } from '../utils/events'

const watchExecutionSchema = z.object({
	executionId: z.string().describe('The execution ID to watch'),
	interval: z
		.number()
		.optional()
		.default(2000)
		.describe('Polling interval in ms. The tool blocks for this duration between polls.'),
	maxPolls: z
		.number()
		.optional()
		.default(30)
		.describe('Maximum number of polls. Total blocking time is roughly maxPolls * interval.'),
	timeout: z
		.number()
		.optional()
		.describe('Maximum time to watch in ms. Overrides maxPolls when reached.'),
})

export function createWatchExecutionTool(config: {
	eventStore: EventStore
}): WorkflowTool<typeof watchExecutionSchema> {
	return createWorkflowTool({
		name: 'watch_execution',
		description:
			'Monitor a running workflow execution by polling for new events at intervals. NOTE: This tool blocks synchronously for up to maxPolls * interval milliseconds (default 60s). It will hold the LLM tool call open during this time. For long-running workflows, use lower maxPolls and poll repeatedly, or set a timeout.',
		parameters: watchExecutionSchema,
		triggers: ['watch', 'stream', 'live', 'subscribe', 'real-time', 'monitor execution'],
		execute: async (params) => {
			const start = Date.now()
			const timeline: Array<Record<string, unknown>> = []
			let lastEventCount = 0
			let polls = 0

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

				const initialCompletion = getCompletedNodes(typedEvents)
				lastEventCount = typedEvents.length

				timeline.push({
					timestamp: new Date().toISOString(),
					eventType: 'poll_start',
					eventCount: typedEvents.length,
					nodesCompleted: initialCompletion,
				})

				while (polls < params.maxPolls) {
					if (params.timeout && Date.now() - start > params.timeout) {
						timeline.push({
							timestamp: new Date().toISOString(),
							eventType: 'watch_timeout',
							message: `Watch timed out after ${params.timeout}ms`,
						})
						break
					}

					polls++
					await new Promise((resolve) => setTimeout(resolve, params.interval))

					const currentEvents = await config.eventStore.retrieve(params.executionId)
					const currentTyped = currentEvents as unknown[]

					if (currentTyped.length > lastEventCount) {
						const newEvents = currentTyped.slice(lastEventCount)
						for (const event of newEvents) {
							const e = event as Record<string, unknown>
							timeline.push({
								timestamp: new Date().toISOString(),
								eventType: e.type,
								nodeId: e.nodeId,
								summary:
									e.type === 'node:error'
										? `Error: ${(e.error as Record<string, unknown>)?.message ?? 'unknown'}`
										: e.type === 'node:finish'
											? `Completed`
											: e.type,
							})
						}
						lastEventCount = currentTyped.length
					}

					const status = getExecutionStatus(currentTyped)
					if (status.status === 'completed' || status.status === 'failed') {
						timeline.push({
							timestamp: new Date().toISOString(),
							eventType: 'execution_finished',
							status: status.status,
						})
						break
					}
				}

				const finalEvents = await config.eventStore.retrieve(params.executionId)
				const finalTyped = finalEvents as unknown[]
				const status = getExecutionStatus(finalTyped)
				const completed = getCompletedNodes(finalTyped)
				const errors = getNodeErrors(finalTyped)

				return {
					status: 'completed',
					data: {
						executionId: params.executionId,
						status: status.status,
						timeline,
						nodesCompleted: completed,
						errorCount: errors.length,
						pollsCompleted: polls,
					},
					awaitingNodeIds: status.status === 'awaiting' ? completed : undefined,
					metadata: {
						duration: Date.now() - start,
						affectedNodes: completed,
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

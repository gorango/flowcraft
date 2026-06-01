import { z } from 'zod'
import type { WorkflowTool, EventStore, FlowcraftRuntime, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import { getEventProp } from '../utils/events'

const rollbackExecutionSchema = z.object({
	executionId: z.string().describe('The execution ID'),
	targetNodeId: z.string().describe('Rollback to this node (it remains completed)'),
	workflowId: z.string().optional().describe('Blueprint ID'),
	version: z.string().optional().describe('Blueprint version'),
})

export function createRollbackExecutionTool(config: {
	eventStore: EventStore
	runtime: FlowcraftRuntime
	resolver: BlueprintResolver
}): WorkflowTool<typeof rollbackExecutionSchema> {
	return createWorkflowTool({
		name: 'rollback_execution',
		description:
			'Undo completion of nodes after a target point to enable re-execution from that point',
		parameters: rollbackExecutionSchema,
		triggers: ['rollback', 'undo', 'revert', 'restore state', 'roll back'],
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

				let blueprintId = params.workflowId
				if (!blueprintId) {
					const startEvent = typedEvents.find(
						(e) => getEventProp<string>(e, 'type') === 'workflow:start',
					)
					const startPayload = (startEvent as Record<string, unknown>)?.payload as
						| Record<string, unknown>
						| undefined
					blueprintId = startPayload?.blueprintId as string
					if (!blueprintId) {
						return {
							status: 'failed',
							error: {
								message: 'Cannot determine blueprint. Provide workflowId.',
								code: ErrorCodes.BLUEPRINT_NOT_FOUND,
							},
							metadata: {
								duration: Date.now() - start,
								affectedNodes: [],
								blueprintId: '',
							},
						}
					}
				}

				const { blueprint } = await config.resolver.resolve({
					id: blueprintId,
					version: params.version,
				})

				const result = await config.runtime.rollbackExecution(
					blueprint,
					params.executionId,
					events,
					params.targetNodeId,
				)

				return {
					status: result.status as 'completed' | 'failed',
					data: {
						rolledBack: true,
						targetNodeId: params.targetNodeId,
						context: result.context,
						warning:
							'Soft rollback: context mutations are undone, but external side effects (API calls, DB writes) cannot be reversed.',
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: Object.keys(
							(result.context._outputs as Record<string, unknown>) ?? {},
						),
						blueprintId: blueprint.id,
						blueprintVersion: blueprint.metadata?.version,
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

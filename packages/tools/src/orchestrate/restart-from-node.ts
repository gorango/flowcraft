import { z } from 'zod'
import type { WorkflowTool, EventStore, FlowcraftRuntime, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import { getEventProp } from '../utils/events'

const restartFromNodeSchema = z.object({
	executionId: z.string().describe('The execution ID'),
	nodeId: z.string().describe('The node to restart from'),
	workflowId: z.string().optional().describe('Blueprint ID'),
	version: z.string().optional().describe('Blueprint version'),
	inputOverrides: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('Override inputs for the restarted node'),
})

export function createRestartFromNodeTool(config: {
	eventStore: EventStore
	runtime: FlowcraftRuntime
	resolver: BlueprintResolver
}): WorkflowTool<typeof restartFromNodeSchema> {
	return createWorkflowTool({
		name: 'restart_from_node',
		description:
			'Restart a workflow execution from a specific node, replaying state up to that point',
		parameters: restartFromNodeSchema,
		triggers: [
			'restart from',
			'replay from',
			'rerun from node',
			'start over from',
			'restart at',
		],
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

				const result = await config.runtime.replayFrom(blueprint, events, params.nodeId, {
					inputOverrides: params.inputOverrides,
				})

				return {
					status: result.status as 'completed' | 'failed' | 'awaiting',
					data: {
						restartedFrom: params.nodeId,
						inputOverrides: params.inputOverrides
							? Object.keys(params.inputOverrides)
							: [],
						context: result.context,
					},
					executionId: result.context._executionId as string | undefined,
					awaitingNodeIds: result.context._awaitingNodeIds as string[] | undefined,
					awaitingDetails: result.context._awaitingDetails as
						| Record<string, unknown>
						| undefined,
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

import { z } from 'zod'
import type { WorkflowTool, EventStore, FlowcraftRuntime, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import { getNodeErrors, getEventProp } from '../utils/events'

const skipFailedNodeSchema = z.object({
	executionId: z.string().describe('The execution ID'),
	nodeId: z.string().describe('The failed node to skip'),
	workflowId: z.string().optional().describe('Blueprint ID'),
	version: z.string().optional().describe('Blueprint version'),
	defaultOutput: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('Mock output to pass downstream'),
})

export function createSkipFailedNodeTool(config: {
	eventStore: EventStore
	runtime: FlowcraftRuntime
	resolver: BlueprintResolver
}): WorkflowTool<typeof skipFailedNodeSchema> {
	return createWorkflowTool({
		name: 'skip_failed_node',
		description:
			'Mark a failed node as skipped with optional mock output so downstream nodes can proceed',
		parameters: skipFailedNodeSchema,
		triggers: ['skip failed', 'ignore failure', 'continue past error', 'bypass failure'],
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

				const errors = getNodeErrors(typedEvents)
				const nodeError = errors.find((e) => e.nodeId === params.nodeId)
				if (!nodeError) {
					return {
						status: 'failed',
						error: {
							message: `Node '${params.nodeId}' has not failed and cannot be skipped`,
							code: ErrorCodes.NODE_NOT_FAILED,
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

				const output = params.defaultOutput ?? {}
				const result = await config.runtime.markNodeCompleted(
					blueprint,
					params.executionId,
					params.nodeId,
					output,
				)

				return {
					status: result.status as 'completed' | 'failed',
					data: {
						nodeId: params.nodeId,
						skipped: true,
						previousError: nodeError.message,
						mockOutput: output,
						context: result.context,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [params.nodeId],
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

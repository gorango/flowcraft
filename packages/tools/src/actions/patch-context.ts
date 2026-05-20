import { z } from 'zod'
import type { WorkflowTool, EventStore, FlowcraftRuntime, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import { getEventProp } from '../utils/events'

const patchNodeContextSchema = z.object({
	executionId: z.string().describe('The execution ID'),
	nodeId: z.string().describe('The target node'),
	patches: z
		.array(
			z.object({
				key: z.string().describe('Context key to modify'),
				value: z.unknown().describe('Value to set'),
				operation: z.enum(['set', 'delete']).optional().default('set'),
			}),
		)
		.describe('Context patches to apply'),
	workflowId: z.string().optional().describe('Blueprint ID'),
})

export function createPatchNodeContextTool(config: {
	eventStore: EventStore
	runtime: FlowcraftRuntime
	resolver: BlueprintResolver
}): WorkflowTool<typeof patchNodeContextSchema> {
	return createWorkflowTool({
		name: 'patch_node_context',
		description:
			'Modify context values mid-execution to correct or enrich workflow state for a specific node',
		parameters: patchNodeContextSchema,
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
				})

				const patches = params.patches.map((p) => ({
					key: p.key,
					value: p.value,
					op: p.operation,
				}))

				const result = await config.runtime.patchContext(
					blueprint,
					params.executionId,
					events,
					patches as Array<{ key: string; value: unknown; op: 'set' | 'delete' }>,
				)

				return {
					status: result.status as 'completed' | 'failed',
					data: {
						nodeId: params.nodeId,
						patchesApplied: patches.length,
						context: result.context,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
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

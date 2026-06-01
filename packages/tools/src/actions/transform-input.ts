import { z } from 'zod'
import type { WorkflowTool, EventStore, FlowcraftRuntime, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import { getEventProp } from '../utils/events'

const transformNodeInputSchema = z.object({
	executionId: z.string().describe('The execution ID'),
	nodeId: z.string().describe('The node to transform input for'),
	workflowId: z.string().optional().describe('Blueprint ID'),
	version: z.string().optional().describe('Blueprint version'),
	inputOverrides: z.record(z.string(), z.unknown()).describe('Input values to set/override'),
})

export function createTransformNodeInputTool(config: {
	eventStore: EventStore
	runtime: FlowcraftRuntime
	resolver: BlueprintResolver
}): WorkflowTool<typeof transformNodeInputSchema> {
	return createWorkflowTool({
		name: 'transform_node_input',
		description: 'Modify the input data that a specific node will receive before it executes',
		parameters: transformNodeInputSchema,
		triggers: [
			'transform input',
			'modify input',
			'remap input',
			'change node input',
			'set input',
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

				const node = blueprint.nodes.find((n) => n.id === params.nodeId)
				if (!node) {
					return {
						status: 'failed',
						error: {
							message: `Node '${params.nodeId}' not found in blueprint`,
							code: ErrorCodes.NODE_NOT_FOUND,
						},
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: blueprint.id,
						},
					}
				}

				const patches = Object.entries(params.inputOverrides).map(([key, value]) => ({
					key,
					value,
					op: 'set' as const,
				}))

				const result = await config.runtime.patchContext(
					blueprint,
					params.executionId,
					events,
					patches,
				)

				return {
					status: result.status as 'completed' | 'failed',
					data: {
						nodeId: params.nodeId,
						patchedKeys: Object.keys(params.inputOverrides),
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

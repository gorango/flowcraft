import { z } from 'zod'
import type { WorkflowTool, FlowcraftRuntime, BlueprintResolver, EventStore } from '../types'
import { createWorkflowTool } from '../tool'

const resumeWorkflowSchema = z.object({
	executionId: z.string().describe('The execution to resume'),
	workflowId: z
		.string()
		.optional()
		.describe('Workflow blueprint ID (required if not inferable from execution)'),
	version: z.string().optional().describe('Blueprint version'),
	nodeId: z.string().optional().describe('Specific awaiting node to resume'),
	output: z
		.record(z.string(), z.unknown())
		.describe('Data to provide to the awaiting node')
		.default({}),
	action: z.string().optional().describe('Action string for conditional routing'),
})

export function createResumeWorkflowTool(config: {
	resolver: BlueprintResolver
	runtime: FlowcraftRuntime
	eventStore: EventStore
}): WorkflowTool<typeof resumeWorkflowSchema> {
	return createWorkflowTool({
		name: 'resume_workflow',
		description: 'Resume a workflow that is waiting for human input or an external event',
		parameters: resumeWorkflowSchema,
		triggers: ['resume', 'continue', 'pick up', 'unpause', 'proceed', 'continue execution'],
		execute: async (params) => {
			const start = Date.now()

			try {
				let blueprint: Awaited<ReturnType<BlueprintResolver['resolve']>>['blueprint']
				let version: string

				if (params.workflowId) {
					const resolved = await config.resolver.resolve({
						id: params.workflowId,
						version: params.version,
					})
					blueprint = resolved.blueprint
					version = resolved.version
				} else {
					const events = await config.eventStore.retrieve(params.executionId)
					const startEvent = (events as Array<Record<string, unknown>>).find(
						(e) => e.type === 'workflow:start',
					)
					if (!startEvent?.blueprintId) {
						throw new Error('Cannot determine blueprint from events. Provide workflowId.')
					}
					const resolved = await config.resolver.resolve({
						id: startEvent.blueprintId as string,
						version: params.version,
					})
					blueprint = resolved.blueprint
					version = resolved.version
				}

				const events = await config.eventStore.retrieve(params.executionId)
				const typedEvents = events as Array<Record<string, unknown>>
				const finishEvent = typedEvents.find((e) => e.type === 'workflow:finish')
				if (finishEvent) {
					throw new Error(`Execution ${params.executionId} has already finished`)
				}

				const contextState: Record<string, unknown> = {}
				for (const event of typedEvents.filter((e) => e.type === 'context:change')) {
					if (event.key && event.value !== undefined) {
						contextState[event.key as string] = event.value
					}
				}

				const serializedContext = JSON.stringify(contextState)

				const result = await config.runtime.resume(
					blueprint,
					serializedContext,
					{ output: params.output, action: params.action },
					params.nodeId,
				)

				const duration = Date.now() - start
				const ctx = result.context

				return {
					status: result.status as 'completed' | 'failed' | 'awaiting',
					data: ctx,
					executionId: params.executionId,
					awaitingNodeIds: result.context._awaitingNodeIds,
					awaitingDetails: result.context._awaitingDetails,
					metadata: {
						duration,
						affectedNodes: Object.keys(ctx._outputs || {}),
						blueprintId: blueprint.id,
						blueprintVersion: version,
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					executionId: params.executionId,
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

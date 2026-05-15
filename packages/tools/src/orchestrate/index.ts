import { z } from 'zod'
import type { WorkflowTool, FlowcraftRuntime, BlueprintResolver, EventStore } from '../types'
import { createWorkflowTool } from '../tool'

const runWorkflowSchema = z.object({
	workflowId: z.string().describe('The workflow blueprint ID to execute'),
	version: z.string().optional().describe('Blueprint version (defaults to latest)'),
	params: z.record(z.unknown()).describe('Initial context data for the workflow').default({}),
	mode: z
		.enum(['sync', 'async'])
		.optional()
		.default('sync')
		.describe('sync waits for completion, async returns executionId immediately'),
})

export function createRunWorkflowTool(config: {
	resolver: BlueprintResolver
	runtime: FlowcraftRuntime
	asyncStore?: import('../types').AsyncExecutionStore
}): WorkflowTool<typeof runWorkflowSchema> {
	return createWorkflowTool({
		name: 'run_workflow',
		description:
			'Execute a workflow by ID with the given parameters. Use sync mode to wait for completion, or async to start in the background.',
		parameters: runWorkflowSchema,
		execute: async (params) => {
			const start = Date.now()
			const executionId = crypto.randomUUID()

			try {
				const { blueprint, version } = await config.resolver.resolve({
					id: params.workflowId,
					version: params.version,
				})

				if (params.mode === 'async' && config.asyncStore) {
					const runFn = async () => {
						const result = await config.runtime.run(blueprint, params.params)
						const duration = Date.now() - start
						const ctx = result.context.toJSON()
						return {
							status: result.status as 'completed' | 'failed' | 'awaiting',
							data: ctx,
							executionId,
							awaitingNodeIds: result.context._awaitingNodeIds,
							awaitingDetails: result.context._awaitingDetails,
							metadata: {
								duration,
								nodesExecuted: Object.keys(ctx._outputs || {}),
								blueprintId: blueprint.id,
								blueprintVersion: version,
							},
						}
					}

					config.asyncStore.start(executionId, runFn)

					return {
						status: 'started',
						executionId,
						metadata: {
							duration: Date.now() - start,
							nodesExecuted: [],
							blueprintId: blueprint.id,
							blueprintVersion: version,
						},
					}
				}

				const result = await config.runtime.run(blueprint, params.params)
				const duration = Date.now() - start
				const ctx = result.context.toJSON()

				return {
					status: result.status as 'completed' | 'failed' | 'awaiting',
					data: ctx,
					executionId: result.context._executionId ?? executionId,
					awaitingNodeIds: result.context._awaitingNodeIds,
					awaitingDetails: result.context._awaitingDetails,
					metadata: {
						duration,
						nodesExecuted: Object.keys(ctx._outputs || {}),
						blueprintId: blueprint.id,
						blueprintVersion: version,
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					executionId,
					metadata: {
						duration: Date.now() - start,
						nodesExecuted: [],
						blueprintId: params.workflowId,
					},
				}
			}
		},
	})
}

const resumeWorkflowSchema = z.object({
	executionId: z.string().describe('The execution to resume'),
	workflowId: z
		.string()
		.optional()
		.describe('Workflow blueprint ID (required if not inferable from execution)'),
	version: z.string().optional().describe('Blueprint version'),
	nodeId: z.string().optional().describe('Specific awaiting node to resume'),
	output: z.record(z.unknown()).describe('Data to provide to the awaiting node').default({}),
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
						throw new Error(
							'Cannot determine blueprint from events. Provide workflowId.',
						)
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
				const ctx = result.context.toJSON()

				return {
					status: result.status as 'completed' | 'failed' | 'awaiting',
					data: ctx,
					executionId: params.executionId,
					awaitingNodeIds: result.context._awaitingNodeIds,
					awaitingDetails: result.context._awaitingDetails,
					metadata: {
						duration,
						nodesExecuted: Object.keys(ctx._outputs || {}),
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
						nodesExecuted: [],
						blueprintId: params.workflowId ?? '',
					},
				}
			}
		},
	})
}

const checkStatusSchema = z.object({
	executionId: z.string().describe('The execution to check'),
})

export function createCheckStatusTool(config: {
	eventStore: EventStore
}): WorkflowTool<typeof checkStatusSchema> {
	return createWorkflowTool({
		name: 'check_workflow_status',
		description: 'Check the current status of a running or completed workflow execution',
		parameters: checkStatusSchema,
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
							nodesExecuted: [],
							blueprintId: '',
						},
					}
				}

				const startEvent = typedEvents.find((e) => e.type === 'workflow:start')
				const finishEvent = typedEvents.find((e) => e.type === 'workflow:finish')
				const stallEvent = typedEvents.find((e) => e.type === 'workflow:stall')
				const pauseEvent = typedEvents.find((e) => e.type === 'workflow:pause')
				const errorEvents = typedEvents.filter((e) => e.type === 'node:error')
				const nodeFinishEvents = typedEvents.filter((e) => e.type === 'node:finish')

				let status: 'completed' | 'failed' | 'awaiting' | 'started' = 'started'
				if (finishEvent) status = 'completed'
				else if (stallEvent) status = 'failed'
				else if (pauseEvent) status = 'awaiting'

				const nodeIds = nodeFinishEvents.map((e) => e.nodeId as string)

				return {
					status,
					data: {
						eventCount: typedEvents.length,
						nodesCompleted: nodeIds,
						errorCount: errorEvents.length,
					},
					executionId: params.executionId,
					metadata: {
						duration: Date.now() - start,
						nodesExecuted: nodeIds,
						blueprintId: (startEvent?.blueprintId as string) ?? '',
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					executionId: params.executionId,
					metadata: { duration: Date.now() - start, nodesExecuted: [], blueprintId: '' },
				}
			}
		},
	})
}

const cancelWorkflowSchema = z.object({
	executionId: z.string().describe('The execution to cancel'),
	reason: z.string().optional().describe('Reason for cancellation'),
})

export function createCancelWorkflowTool(config: {
	controllers: Map<string, AbortController>
}): WorkflowTool<typeof cancelWorkflowSchema> {
	return createWorkflowTool({
		name: 'cancel_workflow',
		description: 'Cancel a running workflow by execution ID',
		parameters: cancelWorkflowSchema,
		execute: async (params) => {
			const start = Date.now()
			const controller = config.controllers.get(params.executionId)

			if (!controller) {
				return {
					status: 'failed',
					error: { message: `No active execution found for ${params.executionId}` },
					executionId: params.executionId,
					metadata: { duration: Date.now() - start, nodesExecuted: [], blueprintId: '' },
				}
			}

			controller.abort(params.reason ?? 'Cancelled by user')
			config.controllers.delete(params.executionId)

			return {
				status: 'completed',
				data: { cancelled: true, reason: params.reason },
				executionId: params.executionId,
				metadata: { duration: Date.now() - start, nodesExecuted: [], blueprintId: '' },
			}
		},
	})
}

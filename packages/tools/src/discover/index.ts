import { z } from 'zod'
import type { WorkflowTool, BlueprintResolver, BlueprintDatabase, EventStore } from '../types'
import { createWorkflowTool } from '../tool'

const listWorkflowsSchema = z.object({
	limit: z.number().optional().default(50).describe('Maximum number of workflows to return'),
	offset: z.number().optional().default(0).describe('Offset for pagination'),
})

export function createListWorkflowsTool(config: {
	resolver: BlueprintDatabase | BlueprintResolver
}): WorkflowTool<typeof listWorkflowsSchema> {
	return createWorkflowTool({
		name: 'list_workflows',
		description: 'List available workflow blueprints with their IDs, versions, and metadata',
		parameters: listWorkflowsSchema,
		execute: async (params) => {
			const start = Date.now()

			try {
				if ('list' in config.resolver) {
					const workflows = await config.resolver.list({
						limit: params.limit,
						offset: params.offset,
					})

					return {
						status: 'completed',
						data: { workflows, total: workflows.length },
						metadata: {
							duration: Date.now() - start,
							nodesExecuted: [],
							blueprintId: '',
						},
					}
				}

				return {
					status: 'completed',
					data: { workflows: [], note: 'Resolver does not support listing' },
					metadata: { duration: Date.now() - start, nodesExecuted: [], blueprintId: '' },
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: { duration: Date.now() - start, nodesExecuted: [], blueprintId: '' },
				}
			}
		},
	})
}

const getWorkflowSchema = z.object({
	workflowId: z.string().describe('The workflow blueprint ID'),
	version: z.string().optional().describe('Blueprint version (defaults to latest)'),
	includeBlueprint: z
		.boolean()
		.optional()
		.default(false)
		.describe('Include the full blueprint definition'),
})

export function createGetWorkflowTool(config: {
	resolver: BlueprintResolver
}): WorkflowTool<typeof getWorkflowSchema> {
	return createWorkflowTool({
		name: 'get_workflow',
		description: 'Get details about a specific workflow blueprint by ID',
		parameters: getWorkflowSchema,
		execute: async (params) => {
			const start = Date.now()

			try {
				const { blueprint, version } = await config.resolver.resolve({
					id: params.workflowId,
					version: params.version,
				})

				return {
					status: 'completed',
					data: {
						id: blueprint.id,
						version,
						metadata: blueprint.metadata,
						nodeCount: blueprint.nodes.length,
						edgeCount: blueprint.edges.length,
						blueprint: params.includeBlueprint ? blueprint : undefined,
					},
					metadata: {
						duration: Date.now() - start,
						nodesExecuted: blueprint.nodes.map((n) => n.id),
						blueprintId: blueprint.id,
						blueprintVersion: version,
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
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

const listExecutionsSchema = z.object({
	limit: z.number().optional().default(20).describe('Maximum number of executions to return'),
	blueprintId: z.string().optional().describe('Filter by blueprint ID'),
})

export function createListExecutionsTool(config: {
	eventStore: EventStore
	executionIndex?: Map<
		string,
		{ executionId: string; blueprintId: string; status: string; startedAt: number }
	>
}): WorkflowTool<typeof listExecutionsSchema> {
	return createWorkflowTool({
		name: 'list_executions',
		description: 'List recent workflow executions with their status and metadata',
		parameters: listExecutionsSchema,
		execute: async (params) => {
			const start = Date.now()

			try {
				if (config.executionIndex) {
					let executions = Array.from(config.executionIndex.values())

					if (params.blueprintId) {
						executions = executions.filter((e) => e.blueprintId === params.blueprintId)
					}

					executions = executions.slice(0, params.limit)

					return {
						status: 'completed',
						data: { executions, total: executions.length },
						metadata: {
							duration: Date.now() - start,
							nodesExecuted: [],
							blueprintId: '',
						},
					}
				}

				return {
					status: 'completed',
					data: { executions: [], note: 'No execution index provided' },
					metadata: { duration: Date.now() - start, nodesExecuted: [], blueprintId: '' },
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: { duration: Date.now() - start, nodesExecuted: [], blueprintId: '' },
				}
			}
		},
	})
}

const getExecutionSchema = z.object({
	executionId: z.string().describe('The execution ID to inspect'),
})

export function createGetExecutionTool(config: {
	eventStore: EventStore
}): WorkflowTool<typeof getExecutionSchema> {
	return createWorkflowTool({
		name: 'get_execution',
		description:
			'Get detailed information about a specific workflow execution including events and final state',
		parameters: getExecutionSchema,
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
				const errorEvents = typedEvents.filter((e) => e.type === 'node:error')
				const nodeEvents = typedEvents.filter((e) => e.type === 'node:finish')

				const contextState: Record<string, unknown> = {}
				for (const event of typedEvents.filter((e) => e.type === 'context:change')) {
					if (event.key && event.value !== undefined) {
						contextState[event.key as string] = event.value
					}
				}

				const status = finishEvent ? (finishEvent.status ?? 'completed') : 'running'

				return {
					status: status === 'completed' ? 'completed' : 'started',
					data: {
						executionId: params.executionId,
						blueprintId: startEvent?.blueprintId,
						status,
						eventCount: typedEvents.length,
						nodesCompleted: nodeEvents.map((e) => e.nodeId),
						errors: errorEvents.map((e) => ({
							nodeId: e.nodeId,
							message: e.error,
						})),
						finalContext: contextState,
					},
					metadata: {
						duration: Date.now() - start,
						nodesExecuted: nodeEvents.map((e) => e.nodeId as string),
						blueprintId: (startEvent?.blueprintId as string) ?? '',
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: { duration: Date.now() - start, nodesExecuted: [], blueprintId: '' },
				}
			}
		},
	})
}

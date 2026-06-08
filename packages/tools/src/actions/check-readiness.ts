import { z } from 'zod'
import type { WorkflowTool, EventStore, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'
import { getCompletedNodes, getExecutionStatus } from '../utils/events'
import { getPredecessors, haveAllPredecessorsCompleted } from '../utils/graph'
import { ErrorCodes } from '../utils/errors'

const checkNodeReadinessSchema = z.object({
	executionId: z.string().describe('The execution to check against'),
	nodeId: z.string().describe('The node ID to check'),
	workflowId: z
		.string()
		.optional()
		.describe('Blueprint ID (required if not inferable from events)'),
	version: z.string().optional().describe('Blueprint version'),
})

export function createCheckNodeReadinessTool(config: {
	eventStore: EventStore
	resolver: BlueprintResolver
}): WorkflowTool<typeof checkNodeReadinessSchema> {
	return createWorkflowTool({
		name: 'check_node_readiness',
		description: 'Check if a node is ready to execute by verifying all predecessors have completed',
		parameters: checkNodeReadinessSchema,
		triggers: ['ready', 'can run', 'predecessors done', 'prereqs', 'is node ready'],
		execute: async (params) => {
			const start = Date.now()

			try {
				const events = await config.eventStore.retrieve(params.executionId)
				const typedEvents = events

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
				if (status.blueprintId && !params.workflowId) {
					params = { ...params, workflowId: status.blueprintId }
				}

				const completedNodes = new Set(getCompletedNodes(typedEvents))

				if (completedNodes.has(params.nodeId)) {
					return {
						status: 'completed',
						data: {
							ready: false,
							alreadyCompleted: true,
							predecessors: [],
							joinStrategy: 'all',
							allInputsAvailable: true,
						},
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: status.blueprintId ?? '',
						},
					}
				}

				if (!params.workflowId) {
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

				const { blueprint } = await config.resolver.resolve({
					id: params.workflowId,
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

				const predecessors = getPredecessors(blueprint, params.nodeId)
				const predecessorStatus = predecessors.map((p) => ({
					nodeId: p.nodeId,
					completed: completedNodes.has(p.nodeId),
				}))

				const joinStrategy = node.config?.joinStrategy ?? 'all'
				const ready =
					joinStrategy === 'any'
						? predecessorStatus.some((p) => p.completed) || predecessors.length === 0
						: haveAllPredecessorsCompleted(blueprint, params.nodeId, completedNodes)

				const nodeRecord = node
				const nodeInputs = nodeRecord.inputs
				const missingInputs: string[] = []
				if (nodeInputs && typeof nodeInputs === 'object') {
					for (const [inputKey, contextKey] of Object.entries(nodeInputs)) {
						if (typeof contextKey === 'string' && !contextKey.startsWith('_')) {
							const sourceNode = contextKey.split('.')[0]
							if (sourceNode && !completedNodes.has(sourceNode)) {
								missingInputs.push(inputKey)
							}
						}
					}
				}

				return {
					status: 'completed',
					data: {
						ready,
						predecessors: predecessorStatus,
						joinStrategy,
						allInputsAvailable: ready && missingInputs.length === 0,
						missingInputs,
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

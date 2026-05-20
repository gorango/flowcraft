import { z } from 'zod'
import type { WorkflowBlueprint } from 'flowcraft'
import type { WorkflowTool } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'
import { nodeId } from './helpers'

const addRetryConfigSchema = z.object({
	blueprint: z
		.object({ id: z.string(), nodes: z.array(z.unknown()), edges: z.array(z.unknown()) })
		.describe('The blueprint to modify'),
	nodeIds: z.array(z.string()).describe('Nodes to configure'),
	maxRetries: z.number().min(0).max(10).default(3),
	retryDelay: z.number().min(0).default(1000).describe('Delay between retries in ms'),
})

export function createAddRetryConfigTool(): WorkflowTool<typeof addRetryConfigSchema> {
	return createWorkflowTool({
		name: 'add_retry_config',
		description: 'Add retry configuration to specific nodes in a workflow blueprint',
		parameters: addRetryConfigSchema,
		execute: async (params) => {
			const start = Date.now()

			try {
				const blueprint = params.blueprint as unknown as WorkflowBlueprint
				const existingIds = new Set(blueprint.nodes.map((n) => nodeId(n)))
				const missing = params.nodeIds.filter((id) => !existingIds.has(id))

				if (missing.length > 0) {
					return {
						status: 'failed',
						error: {
							message: `Nodes not found in blueprint: ${missing.join(', ')}`,
							code: ErrorCodes.NODE_NOT_FOUND,
						},
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: blueprint.id,
						},
					}
				}

				const modifiedNodes = blueprint.nodes.map((n) => {
					const id = nodeId(n)
					if (!params.nodeIds.includes(id)) return n
					const node = n as unknown as Record<string, unknown>
					const existingConfig = (node.config as Record<string, unknown>) ?? {}
					return {
						...n,
						config: {
							...existingConfig,
							maxRetries: params.maxRetries,
							retryDelay: params.retryDelay,
						},
					}
				})

				const modified: WorkflowBlueprint = {
					...blueprint,
					nodes: modifiedNodes as WorkflowBlueprint['nodes'],
				}

				return {
					status: 'completed',
					data: {
						blueprint: modified,
						configuredNodes: params.nodeIds,
						maxRetries: params.maxRetries,
						retryDelay: params.retryDelay,
					},
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: modified.id,
						blueprintVersion: modified.metadata?.version,
					},
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: {
						duration: Date.now() - start,
						affectedNodes: [],
						blueprintId: params.blueprint.id,
					},
				}
			}
		},
	})
}

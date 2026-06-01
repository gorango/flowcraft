import { z } from 'zod'
import type { WorkflowBlueprint } from 'flowcraft'
import type { WorkflowTool, FlowcraftRuntime, BlueprintResolver } from '../types'
import { createWorkflowTool } from '../tool'
import { isInternalNode } from '../types'

export interface NodeActionConfig {
	nodeId: string
	description?: string
	includeParams?: boolean
	triggers?: string[]
}

export function createNodeActionTools(
	blueprint: WorkflowBlueprint,
	config: {
		runtime: FlowcraftRuntime
		resolver?: BlueprintResolver
		nodes?: NodeActionConfig[]
	},
): WorkflowTool[] {
	const nodeConfigs = config.nodes ?? []
	const enabledNodeIds = new Set(nodeConfigs.map((c) => c.nodeId))

	return blueprint.nodes
		.filter((node) => {
			if (isInternalNode(node.uses)) return false
			if (config.nodes && !enabledNodeIds.has(node.id)) return false
			return true
		})
		.map((node) => {
			const nodeConfig = nodeConfigs.find((c) => c.nodeId === node.id)
			const description =
				nodeConfig?.description ??
				`Execute the "${node.id}" step of the "${blueprint.id}" workflow`

			const paramsSchema =
				nodeConfig?.includeParams !== false && node.inputs
					? z.object({
							inputs: z
								.record(z.string(), z.unknown())
								.describe('Input data for this node')
								.default({}),
						})
					: z.object({}).optional()

			return createWorkflowTool({
				name: `${blueprint.id}__${node.id}`,
				description,
				parameters: paramsSchema,
				triggers: nodeConfig?.triggers,
				execute: async (params) => {
					const start = Date.now()

					try {
						const inputParams = params as
							| { inputs?: Record<string, unknown> }
							| undefined
						const result = await config.runtime.run(blueprint, {
							...inputParams?.inputs,
							_targetNode: node.id,
						})

						const ctx = result.context
						const nodeOutput =
							ctx[node.id] ?? (ctx._outputs as Record<string, unknown>)?.[node.id]

						return {
							status: result.status as 'completed' | 'failed',
							data: nodeOutput,
							metadata: {
								duration: Date.now() - start,
								affectedNodes: [node.id],
								blueprintId: blueprint.id,
								blueprintVersion: blueprint.metadata?.version,
							},
						}
					} catch (error) {
						return {
							status: 'failed',
							error: {
								message: error instanceof Error ? error.message : String(error),
							},
							metadata: {
								duration: Date.now() - start,
								affectedNodes: [],
								blueprintId: blueprint.id,
								blueprintVersion: blueprint.metadata?.version,
							},
						}
					}
				},
			})
		})
}

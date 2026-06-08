import { z } from 'zod'
import type { WorkflowBlueprint } from 'flowcraft'
import type { WorkflowTool } from '../types'
import { createWorkflowTool } from '../tool'
import { nodeId } from './helpers'

const checkDataFlowSchema = z.object({
	blueprint: z
		.object({ id: z.string(), nodes: z.array(z.unknown()), edges: z.array(z.unknown()) })
		.describe('The blueprint'),
})

export function createCheckDataFlowTool(): WorkflowTool<typeof checkDataFlowSchema> {
	return createWorkflowTool({
		name: 'check_data_flow',
		description: 'Validate input/output data compatibility between connected nodes in a blueprint',
		parameters: checkDataFlowSchema,
		triggers: ['data flow', 'check data', 'input output', 'data validation', 'validate wiring'],
		execute: async (params) => {
			const start = Date.now()

			try {
				const blueprint = params.blueprint as unknown as WorkflowBlueprint
				const issues: Array<{
					severity: 'error' | 'warning'
					fromNode: string
					toNode: string
					message: string
				}> = []
				const dataFlowMap: Array<{
					from: string
					to: string
					inputMapping: Record<string, string>
					hasTransform: boolean
				}> = []

				for (const edge of blueprint.edges) {
					const e = edge
					const fromNode = e.source
					const toNode = e.target
					const transform = e.transform

					const targetNode = blueprint.nodes.find((n) => nodeId(n) === toNode)
					const targetInputs = targetNode?.inputs

					let inputMapping: Record<string, string> = {}
					if (targetInputs && typeof targetInputs === 'object' && !Array.isArray(targetInputs)) {
						inputMapping = targetInputs
					} else if (typeof targetInputs === 'string') {
						inputMapping = { default: targetInputs }
					}

					dataFlowMap.push({
						from: fromNode,
						to: toNode,
						inputMapping,
						hasTransform: !!transform,
					})

					if (transform) {
						// Extract variable references from the transform expression.
						// At runtime, transforms receive { input, context } where:
						//   - input: the source node's output
						//   - context: the full workflow context (_outputs.*, etc.)
						// The regex supports nested property access like context.foo.bar
						const refs =
							transform.match(/\b(input(?:\.[a-zA-Z0-9_]+)*|context(?:\.[a-zA-Z0-9_]+)+)\b/g) ?? []
						let valid = true
						for (const ref of refs) {
							if (ref === 'input') continue
							if (ref.startsWith('context.')) continue
							valid = false
							issues.push({
								severity: 'warning',
								fromNode,
								toNode,
								message: `Transform references undefined variable '${ref}'`,
							})
						}
						if (refs.length === 0 && transform.length > 0) {
							issues.push({
								severity: 'warning',
								fromNode,
								toNode,
								message: 'Transform expression may not reference any input data',
							})
						}
						if (!valid) {
							issues.push({
								severity: 'error',
								fromNode,
								toNode,
								message: `Transform contains invalid references: ${transform}`,
							})
						}
					}

					for (const [inputKey, contextKey] of Object.entries(inputMapping)) {
						if (contextKey.startsWith('_')) {
							issues.push({
								severity: 'warning',
								fromNode,
								toNode,
								message: `Input key '${inputKey}' references internal context key '${contextKey}'`,
							})
						}
					}
				}

				const valid = issues.filter((i) => i.severity === 'error').length === 0

				return {
					status: valid ? 'completed' : 'failed',
					data: {
						valid,
						issues,
						dataFlowMap,
						edgeCount: blueprint.edges.length,
						edgesWithTransforms: dataFlowMap.filter((d) => d.hasTransform).length,
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
						blueprintId: params.blueprint.id,
					},
				}
			}
		},
	})
}

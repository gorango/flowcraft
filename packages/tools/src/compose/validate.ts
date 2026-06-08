import { z } from 'zod'
import type { WorkflowBlueprint } from 'flowcraft'
import type { WorkflowTool } from '../types'
import { createWorkflowTool } from '../tool'
import { nodeId, edgeSource, edgeTarget } from './helpers'

const validateBlueprintSchema = z.object({
	blueprint: z
		.object({
			id: z.string(),
			nodes: z.array(z.unknown()),
			edges: z.array(z.unknown()),
		})
		.describe('The blueprint to validate'),
})

export function createValidateBlueprintTool(): WorkflowTool<typeof validateBlueprintSchema> {
	return createWorkflowTool({
		name: 'validate_workflow',
		description:
			'Check a workflow blueprint for errors, cycles, unreachable nodes, and structural issues',
		parameters: validateBlueprintSchema,
		triggers: [
			'validate',
			'check workflow',
			'lint blueprint',
			'verify graph',
			'check errors',
			'is workflow valid',
		],
		execute: async (params) => {
			const start = Date.now()
			try {
				const blueprint = params.blueprint as unknown as WorkflowBlueprint

				let analysisResult: Record<string, unknown> = {}
				try {
					const { analyzeBlueprint, checkForCycles } = await import('flowcraft')
					const analysis = analyzeBlueprint(blueprint)
					const cycles = checkForCycles(blueprint)
					analysisResult = { analysis, cycles }
				} catch {
					analysisResult = { note: 'flowcraft not available, skipping deep analysis' }
				}

				const issues: string[] = []

				if (blueprint.nodes.length === 0) {
					issues.push('Blueprint has no nodes')
				}

				const nodeIds = new Set(blueprint.nodes.map((n) => nodeId(n)))
				for (const edge of blueprint.edges) {
					if (!nodeIds.has(edgeSource(edge))) {
						issues.push(`Edge source '${edgeSource(edge)}' does not match any node`)
					}
					if (!nodeIds.has(edgeTarget(edge))) {
						issues.push(`Edge target '${edgeTarget(edge)}' does not match any node`)
					}
				}

				const startNodes = blueprint.nodes.filter(
					(n) => !blueprint.edges.some((e) => edgeTarget(e) === nodeId(n)),
				)
				if (startNodes.length === 0 && blueprint.nodes.length > 0) {
					issues.push('No start node found (all nodes have incoming edges, possible cycle)')
				}

				const isValid = issues.length === 0

				return {
					status: isValid ? 'completed' : 'failed',
					data: {
						isValid,
						issues,
						...analysisResult,
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

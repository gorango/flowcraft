import { z } from 'zod'
import type { WorkflowBlueprint } from 'flowcraft'
import type { WorkflowTool, BlueprintGeneratorFn } from '../types'
import { createWorkflowTool } from '../tool'

const nodeSchema = z.object({
	id: z.string(),
	purpose: z.string(),
	inputs: z.array(z.string()).optional(),
})

const createBlueprintSchema = z.object({
	description: z.string().describe('What the workflow should do'),
	nodes: z.array(nodeSchema).optional().describe('Suggested node structure'),
})

export function createCreateBlueprintTool(config: {
	generate: BlueprintGeneratorFn
}): WorkflowTool<typeof createBlueprintSchema> {
	return createWorkflowTool({
		name: 'create_workflow',
		description:
			'Generate a workflow blueprint from a natural language description of what the workflow should do',
		parameters: createBlueprintSchema,
		execute: async (params) => {
			const start = Date.now()
			try {
				const blueprint = await config.generate(params)
				return {
					status: 'completed',
					data: { blueprint },
					metadata: {
						duration: Date.now() - start,
						nodesExecuted: blueprint.nodes.map((n) => n.id),
						blueprintId: blueprint.id,
						blueprintVersion: blueprint.metadata?.version,
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

const modifyBlueprintSchema = z.object({
	blueprint: z
		.object({
			id: z.string(),
			nodes: z.array(z.unknown()),
			edges: z.array(z.unknown()),
		})
		.describe('The current blueprint to modify'),
	operation: z
		.enum(['add_node', 'remove_node', 'edit_node', 'add_edge', 'remove_edge', 'edit_edge'])
		.describe('The type of modification to perform'),
	changes: z.record(z.unknown()).describe('The changes to apply'),
})

function nodeId(n: unknown): string {
	return (n as Record<string, unknown>).id as string
}

function edgeSource(e: unknown): string {
	return (e as Record<string, unknown>).source as string
}

function edgeTarget(e: unknown): string {
	return (e as Record<string, unknown>).target as string
}

export function createModifyBlueprintTool(): WorkflowTool<typeof modifyBlueprintSchema> {
	return createWorkflowTool({
		name: 'modify_workflow',
		description: 'Add, remove, or edit nodes and edges in an existing workflow blueprint',
		parameters: modifyBlueprintSchema,
		execute: async (params) => {
			const start = Date.now()
			try {
				const blueprint = params.blueprint as unknown as WorkflowBlueprint
				const nodes = [...blueprint.nodes] as unknown[]
				const edges = [...blueprint.edges] as unknown[]

				switch (params.operation) {
					case 'add_node':
						nodes.push(params.changes)
						break
					case 'remove_node': {
						const targetId = (params.changes as Record<string, unknown>).id as string
						const idx = nodes.findIndex((n) => nodeId(n) === targetId)
						if (idx !== -1) nodes.splice(idx, 1)
						break
					}
					case 'edit_node': {
						const targetId = (params.changes as Record<string, unknown>).id as string
						const idx = nodes.findIndex((n) => nodeId(n) === targetId)
						if (idx !== -1) {
							nodes[idx] = Object.assign({}, nodes[idx], params.changes)
						}
						break
					}
					case 'add_edge':
						edges.push(params.changes)
						break
					case 'remove_edge': {
						const source = (params.changes as Record<string, unknown>).source as string
						const target = (params.changes as Record<string, unknown>).target as string
						const eIdx = edges.findIndex(
							(e) => edgeSource(e) === source && edgeTarget(e) === target,
						)
						if (eIdx !== -1) edges.splice(eIdx, 1)
						break
					}
					case 'edit_edge': {
						const source = (params.changes as Record<string, unknown>).source as string
						const target = (params.changes as Record<string, unknown>).target as string
						const eIdx = edges.findIndex(
							(e) => edgeSource(e) === source && edgeTarget(e) === target,
						)
						if (eIdx !== -1) {
							edges[eIdx] = Object.assign({}, edges[eIdx], params.changes)
						}
						break
					}
				}

				const modified: WorkflowBlueprint = {
					...blueprint,
					nodes: nodes as WorkflowBlueprint['nodes'],
					edges: edges as WorkflowBlueprint['edges'],
				}

				return {
					status: 'completed',
					data: { blueprint: modified },
					metadata: {
						duration: Date.now() - start,
						nodesExecuted: modified.nodes.map((n) => n.id),
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
						nodesExecuted: [],
						blueprintId: params.blueprint.id,
					},
				}
			}
		},
	})
}

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
					issues.push(
						'No start node found (all nodes have incoming edges, possible cycle)',
					)
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
						nodesExecuted: blueprint.nodes.map((n) => n.id),
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
						nodesExecuted: [],
						blueprintId: params.blueprint.id,
					},
				}
			}
		},
	})
}

const describeBlueprintSchema = z.object({
	blueprint: z
		.object({
			id: z.string(),
			nodes: z.array(z.unknown()),
			edges: z.array(z.unknown()),
		})
		.describe('The blueprint to describe'),
})

export function createDescribeBlueprintTool(): WorkflowTool<typeof describeBlueprintSchema> {
	return createWorkflowTool({
		name: 'describe_workflow',
		description: 'Get a human-readable description of a workflow blueprint structure',
		parameters: describeBlueprintSchema,
		execute: async (params) => {
			const start = Date.now()
			const blueprint = params.blueprint as unknown as WorkflowBlueprint

			const nodeDescriptions = blueprint.nodes.map((n) => {
				const node = n as unknown as Record<string, unknown>
				const incoming = blueprint.edges.filter((e) => edgeTarget(e) === node.id)
				const outgoing = blueprint.edges.filter((e) => edgeSource(e) === node.id)
				return {
					id: node.id,
					uses: node.uses,
					incoming: incoming.length,
					outgoing: outgoing.length,
				}
			})

			const startNodeIds = blueprint.nodes
				.filter((n) => !blueprint.edges.some((e) => edgeTarget(e) === nodeId(n)))
				.map((n) => nodeId(n))

			const terminalNodeIds = blueprint.nodes
				.filter((n) => !blueprint.edges.some((e) => edgeSource(e) === nodeId(n)))
				.map((n) => nodeId(n))

			const description =
				`Workflow "${blueprint.id}" has ${blueprint.nodes.length} nodes and ${blueprint.edges.length} edges. ` +
				`Start nodes: ${startNodeIds.join(', ') || 'none'}. ` +
				`Terminal nodes: ${terminalNodeIds.join(', ') || 'none'}. ` +
				`Nodes: ${nodeDescriptions.map((n) => `${n.id} (${n.uses})`).join(', ')}.`

			return {
				status: 'completed',
				data: {
					description,
					summary: {
						nodeCount: blueprint.nodes.length,
						edgeCount: blueprint.edges.length,
						startNodeIds,
						terminalNodeIds,
						nodes: nodeDescriptions,
					},
				},
				metadata: {
					duration: Date.now() - start,
					nodesExecuted: blueprint.nodes.map((n) => n.id),
					blueprintId: blueprint.id,
					blueprintVersion: blueprint.metadata?.version,
				},
			}
		},
	})
}

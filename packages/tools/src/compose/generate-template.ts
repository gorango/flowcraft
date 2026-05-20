import { z } from 'zod'
import type { WorkflowBlueprint } from 'flowcraft'
import type { WorkflowTool, TemplateStore, BlueprintGeneratorFn } from '../types'
import { createWorkflowTool } from '../tool'
import { ErrorCodes } from '../utils/errors'

const generateFromTemplateSchema = z.object({
	template: z.string().describe('Name of the template to use'),
	params: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('Optional parameter overrides to apply to the template'),
	description: z
		.string()
		.optional()
		.describe('Natural language description for AI refinement of the generated blueprint'),
})

export function createGenerateFromTemplateTool(config: {
	templates: TemplateStore
	generate?: BlueprintGeneratorFn
}): WorkflowTool<typeof generateFromTemplateSchema> {
	return createWorkflowTool({
		name: 'generate_from_template',
		description:
			'Create a workflow blueprint from a named template, with optional parameter overrides and AI refinement',
		parameters: generateFromTemplateSchema,
		execute: async (params) => {
			const start = Date.now()

			try {
				const template = config.templates.get(params.template)
				if (!template) {
					const available = config.templates.list()
					return {
						status: 'failed',
						error: {
							message: `Template '${params.template}' not found. Available templates: ${available.join(', ') || 'none'}`,
							code: ErrorCodes.TEMPLATE_NOT_FOUND,
						},
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: '',
						},
					}
				}

				let blueprint = deepCloneBlueprint(template)

				if (params.params) {
					blueprint = applyTemplateParams(blueprint, params.params)
				}

				if (params.description && config.generate) {
					const enhanced = await config.generate({
						description: `${params.description}. Base template: ${params.template}`,
						nodes: blueprint.nodes.map((n: unknown) => {
							const node = n as unknown as Record<string, unknown>
							return {
								id: node.id as string,
								purpose:
									((node.params as Record<string, unknown>)?.purpose as
										| string
										| undefined) ?? (node.id as string),
							}
						}),
					})
					blueprint = enhanced
				}

				return {
					status: 'completed',
					data: {
						blueprint,
						template: params.template,
						appliedOverrides: params.params ? Object.keys(params.params) : [],
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
						blueprintId: '',
					},
				}
			}
		},
	})
}

function deepCloneBlueprint(blueprint: WorkflowBlueprint): WorkflowBlueprint {
	return JSON.parse(JSON.stringify(blueprint)) as WorkflowBlueprint
}

function applyTemplateParams(
	blueprint: WorkflowBlueprint,
	params: Record<string, unknown>,
): WorkflowBlueprint {
	const result = deepCloneBlueprint(blueprint)
	for (const node of result.nodes) {
		const nodeRecord = node as unknown as Record<string, unknown>
		const nodeParams = nodeRecord.params as Record<string, unknown> | undefined
		if (nodeParams) {
			for (const [key, value] of Object.entries(params)) {
				if (key in nodeParams) {
					nodeParams[key] = value
				}
			}
		}
	}
	return result
}

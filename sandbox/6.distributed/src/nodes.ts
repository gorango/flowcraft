import type { NodeContext, NodeResult } from 'flowcraft'
import { callLLM, resolveTemplate } from './utils.js'

/**
 * A generic context for our LLM nodes.
 */
interface LlmNodeContext extends NodeContext {
	params: {
		promptTemplate: string
		inputs: Record<string, string | string[]>
		outputKey?: string
	}
}

/**
 * Resolves input values from the context based on the node's `inputs` mapping.
 */
async function resolveInputs(ctx: NodeContext, inputs: Record<string, string | string[]>): Promise<Record<string, any>> {
	const resolved: Record<string, any> = {}
	for (const [templateKey, sourceKeyOrKeys] of Object.entries(inputs)) {
		const sourceKeys = Array.isArray(sourceKeyOrKeys) ? sourceKeyOrKeys : [sourceKeyOrKeys]
		let valueFound = false
		for (const sourceKey of sourceKeys) {
			if (ctx.has(sourceKey as any)) {
				resolved[templateKey] = ctx.get(sourceKey as any)
				valueFound = true
			}
		}
		if (!valueFound) {
			// If an input isn't found (e.g., from an untaken branch), use an empty string.
			resolved[templateKey] = ''
		}
	}
	return resolved
}

export async function llmProcess(ctx: LlmNodeContext): Promise<NodeResult> {
	const templateData = await resolveInputs(ctx, ctx.params.inputs)
	const prompt = resolveTemplate(ctx.params.promptTemplate, templateData)
	const result = await callLLM(prompt)
	return { output: result }
}

export async function llmCondition(ctx: LlmNodeContext): Promise<NodeResult> {
	const result = await llmProcess(ctx)
	const action = result.output?.toLowerCase().includes('true') ? 'true' : 'false'
	return { action, output: result.output }
}

export async function llmRouter(ctx: LlmNodeContext): Promise<NodeResult> {
	const result = await llmProcess(ctx)
	const action = result.output?.trim() ?? 'default'
	return { action, output: result.output }
}

export async function outputNode(ctx: LlmNodeContext): Promise<NodeResult> {
	const { outputKey = 'final_output' } = ctx.params
	const templateData = await resolveInputs(ctx, ctx.params.inputs)
	const finalOutput = resolveTemplate(ctx.params.promptTemplate, templateData)
	ctx.set(outputKey as any, finalOutput)
	return { output: finalOutput }
}

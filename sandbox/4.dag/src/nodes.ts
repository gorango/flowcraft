import type { NodeContext, NodeResult } from 'flowcraft'
import { callLLM, resolveTemplate } from './utils.js'

/**
 * A generic context for our LLM nodes.
 */
interface LlmNodeContext extends NodeContext {
	params: {
		promptTemplate: string
		inputs: Record<string, string | string[]>
	}
}

/**
 * A helper to resolve input values from the context based on the node's `inputs` mapping.
 * It now correctly handles converging paths where an input might not exist.
 */
async function resolveInputs(ctx: NodeContext, inputs: Record<string, string | string[]>): Promise<Record<string, any>> {
	const resolved: Record<string, any> = {}
	for (const [templateKey, sourceKeyOrKeys] of Object.entries(inputs)) {
		const sourceKeys = Array.isArray(sourceKeyOrKeys) ? sourceKeyOrKeys : [sourceKeyOrKeys]
		let valueFound = false
		for (const sourceKey of sourceKeys) {
			// In v2, the output of a previous node is stored in the context under its ID.
			if (ctx.has(sourceKey as any)) {
				resolved[templateKey] = ctx.get(sourceKey as any)
				valueFound = true
				break
			}
		}
		if (!valueFound) {
			// If an input isn't found (e.g., from an untaken branch), use an empty string.
			resolved[templateKey] = ''
		}
	}
	return resolved
}

/**
 * All node functions now accept the enriched LlmNodeContext.
 * They get their configuration directly from `ctx.params` instead of metadata.
 */
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
	const templateData = await resolveInputs(ctx, ctx.params.inputs)
	const finalOutput = resolveTemplate(ctx.params.promptTemplate, templateData)
	// Set the final result to a predictable key for the main script to retrieve.
	ctx.set('final_output' as any, finalOutput)
	return { output: finalOutput }
}

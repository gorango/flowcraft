import type { IAsyncContext, NodeContext, NodeResult, RuntimeDependencies } from 'flowcraft'
import { callLLM, resolveTemplate } from './utils.js'

/**
 * A generic context for our LLM nodes.
 */
interface LlmNodeContext extends NodeContext<Record<string, any>, RuntimeDependencies> {
	params: {
		promptTemplate: string
		inputs: Record<string, string | string[]>
		outputKey?: string
	}
	context: IAsyncContext
}

/**
 * Resolves input values from the context based on the node's `inputs` mapping.
 */
async function resolveInputs(context: IAsyncContext<any>, inputs: Record<string, string | string[]>): Promise<Record<string, any>> {
	const resolved: Record<string, any> = {}
	for (const [templateKey, sourceKeyOrKeys] of Object.entries(inputs)) {
		const sourceKeys = Array.isArray(sourceKeyOrKeys) ? sourceKeyOrKeys : [sourceKeyOrKeys]
		let valueFound = false
		for (const sourceKey of sourceKeys) {
			if (await context.has(sourceKey)) {
				const value = await context.get(sourceKey)
				// Ensure we don't pass 'undefined' if the key exists but has no value
				if (value !== undefined) {
					resolved[templateKey] = value
					valueFound = true
					break // Found a value, no need to check other keys for this template variable
				}
			}
		}
		if (!valueFound) {
			// If an input isn't found (e.g., from an untaken branch), use an empty string.
			resolved[templateKey] = ''
		}
	}
	return resolved
}

export async function llmProcess(ctx: NodeContext<Record<string, any>, RuntimeDependencies>): Promise<NodeResult> {
	const llmCtx = ctx as any as LlmNodeContext
	const templateData = await resolveInputs(ctx.context, llmCtx.params.inputs)
	const prompt = resolveTemplate(llmCtx.params.promptTemplate, templateData)
	const result = await callLLM(prompt)
	return { output: result }
}

export async function llmCondition(ctx: NodeContext<Record<string, any>, RuntimeDependencies>): Promise<NodeResult> {
	const result = await llmProcess(ctx)
	const action = result.output?.toLowerCase().includes('true') ? 'true' : 'false'
	return { action, output: result.output }
}

export async function llmRouter(ctx: NodeContext<Record<string, any>, RuntimeDependencies>): Promise<NodeResult> {
	const result = await llmProcess(ctx)
	const action = result.output?.trim() ?? 'default'
	return { action, output: result.output }
}

export async function outputNode(ctx: NodeContext<Record<string, any>, RuntimeDependencies>): Promise<NodeResult> {
	const llmCtx = ctx as any as LlmNodeContext
	const { outputKey = 'final_output' } = llmCtx.params
	const templateData = await resolveInputs(ctx.context, llmCtx.params.inputs)
	const finalOutput = resolveTemplate(llmCtx.params.promptTemplate, templateData)
	await ctx.context.set(outputKey as any, finalOutput)
	return { output: finalOutput }
}

import type { NodeArgs } from 'flowcraft'
import { DEFAULT_ACTION, Node } from 'flowcraft'
import { callLLM, resolveTemplate } from './utils'

/**
 * A generic node that executes an LLM prompt.
 * The prompt is a template that gets resolved with inputs from the context.
 */
export class LLMProcessNode extends Node<string, string> {
	private data: any

	constructor(options: any) {
		super(options)
		this.data = options.data
	}

	prep(args: NodeArgs): Promise<string> {
		const template = this.data.promptTemplate
		const inputMappings = this.data.inputs
		const templateData: Record<string, any> = {}

		for (const [templateKey, sourcePathOrPaths] of Object.entries(inputMappings)) {
			const sourcePaths = Array.isArray(sourcePathOrPaths) ? sourcePathOrPaths : [sourcePathOrPaths]
			let value: any

			for (const sourcePath of sourcePaths) {
				value = args.ctx.get(sourcePath)
				if (value !== undefined)
					break
			}

			// If the value is still undefined after checking all sources, use an empty string.
			// This prevents '{{placeholder}}' from appearing in the final output.
			if (value === undefined) {
				args.logger.warn(`[Node: ${this.data.nodeId}] Template variable '{{${templateKey}}}' could not be resolved. Using empty string.`)
				templateData[templateKey] = ''
			}
			else {
				templateData[templateKey] = value
			}
		}

		const resolvedPrompt = resolveTemplate(template, templateData)
		return Promise.resolve(resolvedPrompt)
	}

	exec(args: NodeArgs<string>): Promise<string> {
		args.logger.info(`[Node: ${this.data.nodeId}] Executing LLM process...`)
		return callLLM(args.prepRes)
	}

	async post(args: NodeArgs<string, string>) {
		const keyToSet = this.data.outputKey || this.data.nodeId
		args.ctx.set(keyToSet, args.execRes)
		args.logger.info(`[Node: ${this.data.nodeId}] ✓ Process complete. Result in context key '${keyToSet}'.`)
	}
}

/**
 * An LLM-powered node that evaluates a condition and returns 'true' or 'false'.
 */
export class LLMConditionNode extends Node<string, string, 'true' | 'false'> {
	private data: any

	constructor(options: any) {
		super(options)
		this.data = options.data
	}

	prep = LLMProcessNode.prototype.prep

	exec(args: NodeArgs<string>): Promise<string> {
		args.logger.info(`[Node: ${this.data.nodeId}] Evaluating condition...`)
		return callLLM(args.prepRes)
	}

	async post(args: NodeArgs<string, string>): Promise<'true' | 'false'> {
		const result = args.execRes.toLowerCase().includes('true') ? 'true' : 'false'
		args.ctx.set(this.data.nodeId, result)
		args.logger.info(`[Node: ${this.data.nodeId}] ✓ Condition evaluated to: ${result}`)
		return result
	}
}

/**
 * An LLM-powered node that returns its raw output as an action for dynamic routing.
 */
export class LLMRouterNode extends Node<string, string, string> {
	private data: any

	constructor(options: any) {
		super(options)
		this.data = options.data
	}

	prep = LLMProcessNode.prototype.prep
	exec = LLMProcessNode.prototype.exec

	async post(args: NodeArgs<string, string>): Promise<string> {
		const result = args.execRes.trim()
		args.ctx.set(this.data.nodeId, result)
		args.logger.info(`[Node: ${this.data.nodeId}] ✓ Routing decision is: '${result}'`)
		return result
	}
}

/**
 * Aggregates inputs and sets a final value in the context.
 */
export class OutputNode extends Node<string, void> {
	private data: any

	constructor(options: any) {
		super(options)
		this.data = options.data
	}

	prep = LLMProcessNode.prototype.prep

	async post(args: NodeArgs<string, void>): Promise<string | typeof DEFAULT_ACTION> {
		const finalResult = args.prepRes
		const outputKey = this.data.outputKey
		args.ctx.set(outputKey, finalResult)
		args.logger.info(`[Output] Workflow finished. Final value set to context key '${outputKey}'.`)
		return this.data.returnAction || DEFAULT_ACTION
	}
}

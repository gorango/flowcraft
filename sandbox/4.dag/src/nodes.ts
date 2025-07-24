import type { NodeArgs, NodeOptions } from 'cascade'
import type { WorkflowRegistry } from './registry'
import type { AgentNodeTypeMap } from './types'
import { DEFAULT_ACTION, Node } from 'cascade'
import { callLLM, resolveTemplate } from './utils'

interface AiNodeOptions<T extends keyof AgentNodeTypeMap> extends NodeOptions {
	data: AgentNodeTypeMap[T] & { nodeId: string }
	registry?: WorkflowRegistry
}

/**
 * A generic node that executes an LLM prompt.
 * The prompt is a template that gets resolved with inputs from the context.
 */
export class LLMProcessNode extends Node<string, string> {
	private data: AiNodeOptions<'llm-process'>['data']

	constructor(options: AiNodeOptions<'llm-process'>) {
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

			if (value === undefined)
				args.logger.warn(`[Node: ${this.data.nodeId}] Template variable '{{${templateKey}}}' could not be resolved from any source: [${sourcePaths.join(', ')}].`)

			templateData[templateKey] = value
		}

		const resolvedPrompt = resolveTemplate(template, templateData)
		return Promise.resolve(resolvedPrompt)
	}

	exec(args: NodeArgs<string>): Promise<string> {
		args.logger.info(`[Node: ${this.data.nodeId}] Executing LLM process...`)
		return callLLM(args.prepRes)
	}

	async post(args: NodeArgs<string, string>) {
		args.ctx.set(this.data.nodeId, args.execRes)
		args.logger.info(`[Node: ${this.data.nodeId}] ✓ Process complete.`)
	}
}

/**
 * An LLM-powered node that evaluates a condition and returns 'true' or 'false'.
 */
export class LLMConditionNode extends Node<string, string, 'true' | 'false'> {
	private data: AiNodeOptions<'llm-condition'>['data']

	constructor(options: AiNodeOptions<'llm-condition'>) {
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
	private data: AiNodeOptions<'llm-router'>['data']

	constructor(options: AiNodeOptions<'llm-router'>) {
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
 * Executes a sub-workflow, passing down context and parameters.
 */
export class SubWorkflowNode extends Node {
	private data: AiNodeOptions<'sub-workflow'>['data']
	private registry: WorkflowRegistry

	constructor(options: AiNodeOptions<'sub-workflow'>) {
		super(options)
		this.data = options.data
		if (!options.registry)
			throw new Error('SubWorkflowNode requires a registry to be injected.')

		this.registry = options.registry
	}

	async exec(args: NodeArgs) {
		args.logger.info(`[SubWorkflow] Entering: ${this.data.workflowId}`)
		const subFlow = await this.registry.getFlow(this.data.workflowId)
		const subContext = new (args.ctx.constructor as any)()
		const inputMappings = this.data.inputs || {}
		for (const [subContextKey, parentContextKey] of Object.entries(inputMappings)) {
			if (args.ctx.has(parentContextKey as string)) {
				subContext.set(subContextKey, args.ctx.get(parentContextKey as string))
			}
			else {
				args.logger.warn(`[SubWorkflow: ${this.data.nodeId}] Input mapping failed. Key '${parentContextKey}' not found in parent context.`)
			}
		}

		const runOptions = {
			logger: args.logger,
			controller: args.signal ? ({ signal: args.signal } as AbortController) : undefined,
		}

		await subFlow.run(subContext, runOptions)
		const outputMappings = this.data.outputs || {}

		if (Object.keys(outputMappings).length === 0) {
			if (subContext.has('final_output'))
				args.ctx.set(this.data.nodeId, subContext.get('final_output'))
		}
		else {
			for (const [parentKey, subKey] of Object.entries(outputMappings)) {
				if (subContext.has(subKey)) {
					args.ctx.set(parentKey, subContext.get(subKey))
				}
				else {
					args.logger.warn(`[SubWorkflow: ${this.data.nodeId}] Tried to map output, but key '${subKey}' was not found in sub-workflow '${this.data.workflowId}' context.`)
				}
			}
		}

		args.logger.info(`[SubWorkflow] Exited: ${this.data.workflowId}`)
	}
}

/**
 * Aggregates inputs and sets a final value in the context.
 */
export class OutputNode extends Node<string, void> {
	private data: AiNodeOptions<'output'>['data']

	constructor(options: AiNodeOptions<'output'>) {
		super(options)
		this.data = options.data
	}

	prep = LLMProcessNode.prototype.prep

	async post(args: NodeArgs<string, void>): Promise<string | typeof DEFAULT_ACTION> {
		const finalResult = args.prepRes
		const outputKey = this.data.outputKey || 'final_output'
		args.ctx.set(outputKey, finalResult)
		args.logger.info(`[Output] Workflow finished. Final value set to context key '${outputKey}'.`)
		return this.data.returnAction || DEFAULT_ACTION
	}
}

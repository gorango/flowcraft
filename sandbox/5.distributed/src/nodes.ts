import type { Queue } from 'bullmq'
import type { DEFAULT_ACTION, NodeArgs, NodeOptions } from 'cascade'
import type IORedis from 'ioredis'
import type { WorkflowRegistry } from './registry'
import type { AgentNodeTypeMap, NodeJobPayload } from './types'
import { Flow, Node, TypedContext } from 'cascade'
import { FINAL_ACTION, RUN_ID } from './types'
import { callLLM, resolveTemplate, waitForWorkflow } from './utils'

interface AiNodeOptions<T extends keyof AgentNodeTypeMap> extends NodeOptions {
	data: AgentNodeTypeMap[T] & { nodeId: string }
	registry?: WorkflowRegistry
}

/**
 * A specialized options interface for the distributed SubWorkflowNode.
 */
interface DistSubWorkflowNodeOptions extends NodeOptions {
	data: AgentNodeTypeMap['sub-workflow'] & { nodeId: string }
	registry?: WorkflowRegistry
	queue?: Queue<NodeJobPayload>
	redis?: IORedis
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
	private data: DistSubWorkflowNodeOptions['data']
	private registry?: WorkflowRegistry
	private queue?: Queue<NodeJobPayload>
	private redis?: IORedis

	constructor(options: DistSubWorkflowNodeOptions) {
		super(options)
		this.data = options.data
		this.registry = options.registry
		this.queue = options.queue
		this.redis = options.redis
	}

	async exec(args: NodeArgs) {
		const { logger, ctx: parentContext, params: parentParams } = args
		const subWorkflowId = this.data.workflowId
		if (!this.registry || !this.queue || !this.redis) {
			throw new Error('SubWorkflowNode cannot be executed without a queue and redis instance. Ensure they are injected into the worker\'s GraphBuilder context.')
		}
		// Generate a new, unique run ID for the sub-workflow.
		const subRunId = `${parentContext.get(RUN_ID)}-sub${Math.random().toString(36).substring(2, 6)}`

		logger.info(`[SubWorkflow] Starting distributed sub-flow ${subWorkflowId} with new Run ID: ${subRunId}`)

		// 1. Get the sub-flow graph.
		const subFlow = await this.registry.getFlow(subWorkflowId)
		if (!subFlow.startNode) {
			logger.warn(`Sub-workflow ${subWorkflowId} has no start node. Skipping.`)
			return
		}

		// 2. Prepare the sub-context and map inputs.
		const subContext = new TypedContext()
		const inputMappings = this.data.inputs || {}
		for (const [subKey, parentKey] of Object.entries(inputMappings)) {
			if (parentContext.has(parentKey as string))
				subContext.set(subKey, parentContext.get(parentKey as string))
		}
		subContext.set(RUN_ID, subRunId)

		// 3. Enqueue the start node(s) of the sub-workflow.
		const isParallelStart = subFlow.startNode instanceof Flow
		const nodesToEnqueue = isParallelStart ? (subFlow.startNode as any).nodesToRun : [subFlow.startNode]

		for (const node of nodesToEnqueue) {
			const jobPayload: NodeJobPayload = {
				runId: subRunId,
				workflowId: subWorkflowId,
				nodeId: node.id!,
				context: Object.fromEntries(subContext.entries()),
				params: { ...parentParams, ...this.params },
			}
			await this.queue.add(node.id!, jobPayload)
		}

		// 4. Await the result of the sub-workflow by polling Redis.
		logger.info(`[SubWorkflow] Waiting for result of Run ID: ${subRunId}...`)
		const finalStatus = await waitForWorkflow(this.redis, subRunId, 60000)

		// 5. Process the result and map outputs.
		if (finalStatus.status === 'completed') {
			logger.info(`[SubWorkflow] Sub-flow ${subWorkflowId} (Run ID: ${subRunId}) completed successfully.`)
			const outputMappings = this.data.outputs || {}

			// Re-create a temporary context from the final payload to read from.
			const finalSubContext = new TypedContext(Object.entries(finalStatus.payload.context || {}))

			if (Object.keys(outputMappings).length === 0) {
				if (finalSubContext.has('final_output'))
					parentContext.set(this.data.nodeId, finalSubContext.get('final_output'))
			}
			else {
				for (const [parentKey, subKey] of Object.entries(outputMappings)) {
					if (finalSubContext.has(subKey))
						parentContext.set(parentKey, finalSubContext.get(subKey))
				}
			}
		}
		else {
			// If the sub-workflow failed or was cancelled, fail the parent.
			throw new Error(`Sub-workflow ${subWorkflowId} (Run ID: ${subRunId}) did not complete successfully. Status: ${finalStatus.status}, Reason: ${finalStatus.reason}`)
		}

		logger.info(`[SubWorkflow] Exited: ${this.data.workflowId}`)
	}

	async post(args: NodeArgs) {
		// After the sub-workflow completes and outputs are mapped,
		// we must signal that this is a terminal node for the entire parent workflow.
		const outputMappings = this.data.outputs || {}
		for (const [parentKey, _] of Object.entries(outputMappings)) {
			if (args.ctx.has(parentKey)) {
				args.ctx.set('__final_payload', {
					result: args.ctx.get(parentKey),
					context: Object.fromEntries(args.ctx.entries()),
				})
				break // Just need the first one
			}
		}
		return FINAL_ACTION
	}
}

/**
 * Aggregates inputs and sets a final value in the context.
 */
export class OutputNode extends Node<string, void, typeof FINAL_ACTION | string | typeof DEFAULT_ACTION> {
	private data: AiNodeOptions<'output'>['data']

	constructor(options: AiNodeOptions<'output'>) {
		super(options)
		this.data = options.data
	}

	prep = LLMProcessNode.prototype.prep

	async post(args: NodeArgs<string, void>): Promise<any> {
		const finalResult = args.prepRes
		const outputKey = this.data.outputKey || 'final_output'
		args.ctx.set(outputKey, finalResult)

		// The payload needs to be the *entire context* for sub-workflow output mapping.
		args.ctx.set('__final_payload', {
			result: finalResult,
			context: Object.fromEntries(args.ctx.entries()),
		})

		args.logger.info(`[Output] Workflow branch finished. Final value set to context key '${outputKey}'.`)
		return FINAL_ACTION
	}
}

import type { NodeRegistry } from 'flowcraft'
import { llmCondition, llmProcess, llmRouter, outputNode } from './nodes.js'

/**
 * A central registry mapping the string 'uses' from a blueprint
 * to the actual node function implementation.
 * This is created once and passed to the FlowRuntime.
 */
export const agentNodeRegistry: NodeRegistry = {
	'llm-process': llmProcess,
	'llm-condition': llmCondition,
	'llm-router': llmRouter,
	'output': outputNode,
	// The 'subflow' node is built-in to runtime, so it doesn't need to be registered here.
}

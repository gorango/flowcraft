import type { NodeRegistry } from 'flowcraft/v2'
import { llmCondition, llmProcess, llmRouter, outputNode } from './nodes.js'

/**
 * A central registry mapping the string 'uses' from a blueprint
 * to the actual node function implementation.
 * This is created once and passed to the FlowcraftRuntime.
 */
export const agentNodeRegistry: NodeRegistry = {
	'llm-process': { implementation: llmProcess },
	'llm-condition': { implementation: llmCondition },
	'llm-router': { implementation: llmRouter },
	'output': { implementation: outputNode },
	// The 'subflow' node is built-in to the v2 runtime, so it doesn't need to be registered here.
}

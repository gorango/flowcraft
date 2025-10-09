import type { NodeRegistry } from 'flowcraft'
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
	// 'subflow' and 'parallel-container' are built-in to the V2 runtime.
}

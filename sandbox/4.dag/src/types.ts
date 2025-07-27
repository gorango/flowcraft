import type { NodeConstructorOptions, NodeTypeMap } from 'flowcraft'
import type { WorkflowRegistry } from './registry'

// A generic structure for the `inputs` object in our node data.
// It maps a template key to a context key (or an array of fallback keys).
type NodeInputMap = Record<string, string | string[]>

export interface AgentNodeTypeMap extends NodeTypeMap {
	'llm-process': {
		promptTemplate: string
		inputs: NodeInputMap
		outputKey?: string
	}
	'llm-condition': {
		promptTemplate: string
		inputs: NodeInputMap
	}
	'llm-router': {
		promptTemplate: string
		inputs: NodeInputMap
	}
	'output': {
		promptTemplate: string
		inputs: NodeInputMap
		outputKey: string
		returnAction?: string
	}
}

export interface DagContext { registry: WorkflowRegistry }

export type AiNodeOptions<T extends keyof AgentNodeTypeMap>
	= NodeConstructorOptions<AgentNodeTypeMap[T], DagContext>

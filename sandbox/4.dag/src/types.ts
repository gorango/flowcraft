// A generic structure for the `inputs` object in our node data.
// It maps a template key to a context key (or an array of fallback keys).
type NodeInputMap = Record<string, string | string[]>

export interface AgentNodeTypeMap {
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

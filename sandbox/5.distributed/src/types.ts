// A generic structure for the `inputs` object in our node data.
// It maps a template key to a context key (or an array of fallback keys).
type NodeInputMap = Record<string, string | string[]>

export interface AgentNodeTypeMap {
	'llm-process': {
		promptTemplate: string
		inputs: NodeInputMap
	}
	'llm-condition': {
		promptTemplate: string
		inputs: NodeInputMap
	}
	'llm-router': {
		promptTemplate: string
		inputs: NodeInputMap
	}
	'sub-workflow': {
		workflowId: number
		inputs?: NodeInputMap
		outputs?: Record<string, string>
	}
	'output': {
		promptTemplate: string
		inputs: NodeInputMap
		outputKey?: string // defaults to 'final_output'
		returnAction?: string
	}
}

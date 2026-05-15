import { zodToJsonSchema } from 'zod-to-json-schema'
import type { WorkflowTool } from '../types'

export interface OpenAIFunctionSchema {
	type: 'function'
	function: {
		name: string
		description: string
		parameters: Record<string, unknown>
	}
}

export function toOpenAISchema(tool: WorkflowTool): OpenAIFunctionSchema {
	return {
		type: 'function',
		function: {
			name: tool.name,
			description: tool.description,
			parameters: zodToJsonSchema(tool.parameters) as Record<string, unknown>,
		},
	}
}

export function toOpenAISchemas(tools: WorkflowTool[]): OpenAIFunctionSchema[] {
	return tools.map(toOpenAISchema)
}

import { zodToJsonSchema } from 'zod-to-json-schema'
import type { WorkflowTool } from '../types'

export interface AnthropicTool {
	name: string
	description: string
	input_schema: Record<string, unknown>
}

export function toAnthropicTool(tool: WorkflowTool): AnthropicTool {
	return {
		name: tool.name,
		description: tool.description,
		input_schema: zodToJsonSchema(tool.parameters) as Record<string, unknown>,
	}
}

export function toAnthropicTools(tools: WorkflowTool[]): AnthropicTool[] {
	return tools.map(toAnthropicTool)
}

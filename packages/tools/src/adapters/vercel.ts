import { zodToJsonSchema } from 'zod-to-json-schema'
import type { WorkflowTool, ToolResult } from '../types'

export interface VercelTool {
	name: string
	description: string
	parameters: Record<string, unknown>
	execute: (params: Record<string, unknown>) => Promise<ToolResult>
}

export function toVercelTool(tool: WorkflowTool): VercelTool {
	return {
		name: tool.name,
		description: tool.description,
		parameters: zodToJsonSchema(tool.parameters) as Record<string, unknown>,
		execute: async (params: Record<string, unknown>) => tool.execute(params),
	}
}

export function toVercelTools(tools: WorkflowTool[]): VercelTool[] {
	return tools.map(toVercelTool)
}

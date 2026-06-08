import * as z from 'zod'
import type { WorkflowTool } from '../types'

export interface LangChainTool {
	name: string
	description: string
	schema: Record<string, unknown>
	func: (params: string) => Promise<string>
}

export function toLangChainTool(tool: WorkflowTool): LangChainTool {
	return {
		name: tool.name,
		description: tool.description,
		schema: z.toJSONSchema(tool.parameters) as Record<string, unknown>,
		func: async (input: string) => {
			const params = typeof input === 'string' ? JSON.parse(input) : input
			const result = await tool.execute(params)
			return JSON.stringify(result)
		},
	}
}

export function toLangChainTools(tools: WorkflowTool[]): LangChainTool[] {
	return tools.map(toLangChainTool)
}

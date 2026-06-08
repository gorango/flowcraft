import { tool, type Tool } from 'ai'
import type { WorkflowTool } from '../types'

export type VercelTool = Tool<any, any>

export function toVercelTool(workflowTool: WorkflowTool): VercelTool {
	return tool({
		description: workflowTool.description,
		inputSchema: workflowTool.parameters,
		execute: async (args) => workflowTool.execute(args as never),
	})
}

export function toVercelTools(workflowTools: WorkflowTool[]): VercelTool[] {
	return workflowTools.map(toVercelTool)
}

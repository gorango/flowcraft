import type { z } from 'zod'
import type { ToolResult, WorkflowTool, WorkflowToolConfig } from './types'

export function createWorkflowTool<TParams extends z.ZodType>(
	config: WorkflowToolConfig<TParams> & {
		execute: (params: z.infer<TParams>) => Promise<ToolResult>
	},
): WorkflowTool<TParams> {
	return {
		name: config.name,
		description: config.description,
		parameters: config.parameters,
		triggers: config.triggers,
		execute: config.execute,
	}
}

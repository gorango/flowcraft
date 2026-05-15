import type { z } from 'zod'
import type { WorkflowTool, WorkflowToolConfig } from './types'

export function createWorkflowTool<TParams extends z.ZodType>(
	config: WorkflowToolConfig<TParams> & {
		execute: (params: z.infer<TParams>) => Promise<import('./types').ToolResult>
	},
): WorkflowTool<TParams> {
	return {
		name: config.name,
		description: config.description,
		parameters: config.parameters,
		execute: config.execute,
	}
}

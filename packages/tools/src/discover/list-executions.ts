import { z } from 'zod'
import type { WorkflowTool, EventStore } from '../types'
import { createWorkflowTool } from '../tool'

const listExecutionsSchema = z.object({
	limit: z.number().optional().default(20).describe('Maximum number of executions to return'),
	blueprintId: z.string().optional().describe('Filter by blueprint ID'),
})

export function createListExecutionsTool(config: {
	eventStore: EventStore
	executionIndex?: Map<
		string,
		{ executionId: string; blueprintId: string; status: string; startedAt: number }
	>
}): WorkflowTool<typeof listExecutionsSchema> {
	return createWorkflowTool({
		name: 'list_executions',
		description: 'List recent workflow executions with their status and metadata',
		parameters: listExecutionsSchema,
		execute: async (params) => {
			const start = Date.now()

			try {
				if (config.executionIndex) {
					let executions = Array.from(config.executionIndex.values())

					if (params.blueprintId) {
						executions = executions.filter((e) => e.blueprintId === params.blueprintId)
					}

					executions = executions.slice(0, params.limit)

					return {
						status: 'completed',
						data: { executions, total: executions.length },
						metadata: {
							duration: Date.now() - start,
							affectedNodes: [],
							blueprintId: '',
						},
					}
				}

				return {
					status: 'completed',
					data: { executions: [], note: 'No execution index provided' },
					metadata: { duration: Date.now() - start, affectedNodes: [], blueprintId: '' },
				}
			} catch (error) {
				return {
					status: 'failed',
					error: { message: error instanceof Error ? error.message : String(error) },
					metadata: { duration: Date.now() - start, affectedNodes: [], blueprintId: '' },
				}
			}
		},
	})
}

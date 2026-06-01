import type { WorkflowTool, BlueprintDatabase, BlueprintResolver } from '../types'
import { createListWorkflowsTool } from '../discover/list-workflows'
import { createGetWorkflowTool } from '../discover/get-workflow'
import { createListExecutionsTool } from '../discover/list-executions'
import { createGetExecutionTool } from '../discover/get-execution'
import type { ToolsDeps } from './types'

export function createDiscoverTools(deps: ToolsDeps): WorkflowTool[] {
	const tools: WorkflowTool[] = []

	const listResolver = (deps.database ?? deps.resolver) as
		| BlueprintDatabase
		| BlueprintResolver
		| undefined

	if (listResolver) {
		tools.push(createListWorkflowsTool({ resolver: listResolver }))
	}

	if (deps.resolver) {
		tools.push(createGetWorkflowTool({ resolver: deps.resolver }))
	}

	if (deps.eventStore) {
		tools.push(
			createListExecutionsTool({
				eventStore: deps.eventStore,
				executionIndex: deps.executionIndex,
			}),
		)
		tools.push(createGetExecutionTool({ eventStore: deps.eventStore }))
	}

	return tools
}

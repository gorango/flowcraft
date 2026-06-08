import type { WorkflowTool } from '../types'
import { createGetNodeInfoTool } from '../actions/node-info'
import { createGetNodeOutputTool } from '../actions/get-output'
import { createGetNodeErrorTool } from '../actions/get-error'
import { createRetryNodeTool } from '../actions/retry-node'
import { createExecuteNodeBatchTool } from '../actions/execute-batch'
import { createCheckNodeReadinessTool } from '../actions/check-readiness'
import { createExecuteNodesUpToTool } from '../actions/execute-up-to'
import { createSkipNodeTool } from '../actions/skip-node'
import { createSetNodeCompleteTool } from '../actions/set-node-complete'
import { createTransformNodeInputTool } from '../actions/transform-input'
import { createPatchNodeContextTool } from '../actions/patch-context'
import { createPauseBeforeNodeTool } from '../actions/pause-before-node'
import { createRequestNodeApprovalTool } from '../actions/request-approval'
import type { ToolsDeps } from './types'

export function createActionTools(deps: ToolsDeps): WorkflowTool[] {
	const tools: WorkflowTool[] = []

	if (deps.resolver) {
		tools.push(createGetNodeInfoTool({ resolver: deps.resolver }))
	}

	if (deps.eventStore) {
		tools.push(createGetNodeOutputTool({ eventStore: deps.eventStore }))
		tools.push(createGetNodeErrorTool({ eventStore: deps.eventStore }))
	}

	if (deps.resolver && deps.runtime) {
		tools.push(createExecuteNodeBatchTool({ runtime: deps.runtime, resolver: deps.resolver }))
		tools.push(createExecuteNodesUpToTool({ runtime: deps.runtime, resolver: deps.resolver }))
		tools.push(createPauseBeforeNodeTool({ runtime: deps.runtime, resolver: deps.resolver }))
		tools.push(createRequestNodeApprovalTool({ runtime: deps.runtime, resolver: deps.resolver }))
	}

	if (deps.eventStore && deps.resolver) {
		tools.push(
			createCheckNodeReadinessTool({ eventStore: deps.eventStore, resolver: deps.resolver }),
		)
	}

	if (deps.eventStore && deps.runtime && deps.resolver) {
		tools.push(
			createRetryNodeTool({
				eventStore: deps.eventStore,
				runtime: deps.runtime,
				resolver: deps.resolver,
			}),
		)
		tools.push(
			createSkipNodeTool({
				eventStore: deps.eventStore,
				runtime: deps.runtime,
				resolver: deps.resolver,
			}),
		)
		tools.push(
			createSetNodeCompleteTool({
				eventStore: deps.eventStore,
				runtime: deps.runtime,
				resolver: deps.resolver,
			}),
		)
		tools.push(
			createTransformNodeInputTool({
				eventStore: deps.eventStore,
				runtime: deps.runtime,
				resolver: deps.resolver,
			}),
		)
		tools.push(
			createPatchNodeContextTool({
				eventStore: deps.eventStore,
				runtime: deps.runtime,
				resolver: deps.resolver,
			}),
		)
	}

	return tools
}

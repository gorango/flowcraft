import type { WorkflowTool } from '../types'
import { createRunWorkflowTool } from '../orchestrate/run'
import { createResumeWorkflowTool } from '../orchestrate/resume'
import { createCheckStatusTool } from '../orchestrate/check'
import { createCancelWorkflowTool } from '../orchestrate/cancel'
import { createGetExecutionContextTool } from '../orchestrate/get-context'
import { createGetAwaitingNodesTool } from '../orchestrate/get-awaiting'
import { createRetryFailedNodesTool } from '../orchestrate/retry-failed'
import { createGetExecutionTimelineTool } from '../orchestrate/get-timeline'
import { createGetExecutionMetricsTool } from '../orchestrate/get-metrics'
import { createGetErrorDiagnosisTool } from '../orchestrate/get-diagnosis'
import { createWatchExecutionTool } from '../orchestrate/watch'
import { createSkipFailedNodeTool } from '../orchestrate/skip-failed'
import { createPauseWorkflowTool } from '../orchestrate/pause-workflow'
import { createRequestApprovalTool } from '../orchestrate/request-approval'
import { createRollbackExecutionTool } from '../orchestrate/rollback-execution'
import { createRestartFromNodeTool } from '../orchestrate/restart-from-node'
import { createRunWorkflowsSequentialTool } from '../orchestrate/run-sequential'
import { createRunWorkflowsParallelTool } from '../orchestrate/run-parallel'
import { createBatchExecuteTool } from '../orchestrate/batch-execute'
import type { ToolsDeps } from './types'

export function createOrchestrateTools(deps: ToolsDeps): WorkflowTool[] {
	const tools: WorkflowTool[] = []

	if (deps.resolver && deps.runtime) {
		tools.push(
			createRunWorkflowTool({
				resolver: deps.resolver,
				runtime: deps.runtime,
				asyncStore: deps.asyncStore,
			}),
		)
		tools.push(
			createRunWorkflowsSequentialTool({ resolver: deps.resolver, runtime: deps.runtime }),
		)
		tools.push(
			createRunWorkflowsParallelTool({ resolver: deps.resolver, runtime: deps.runtime }),
		)
		tools.push(createBatchExecuteTool({ resolver: deps.resolver, runtime: deps.runtime }))
	}

	if (deps.resolver && deps.runtime && deps.eventStore) {
		tools.push(
			createResumeWorkflowTool({
				resolver: deps.resolver,
				runtime: deps.runtime,
				eventStore: deps.eventStore,
			}),
		)
		tools.push(
			createSkipFailedNodeTool({
				eventStore: deps.eventStore,
				runtime: deps.runtime,
				resolver: deps.resolver,
			}),
		)
		tools.push(
			createRollbackExecutionTool({
				eventStore: deps.eventStore,
				runtime: deps.runtime,
				resolver: deps.resolver,
			}),
		)
		tools.push(
			createRestartFromNodeTool({
				eventStore: deps.eventStore,
				runtime: deps.runtime,
				resolver: deps.resolver,
			}),
		)
		tools.push(
			createRetryFailedNodesTool({
				eventStore: deps.eventStore,
				runtime: deps.runtime,
				resolver: deps.resolver,
			}),
		)
	}

	if (deps.runtime) {
		tools.push(createPauseWorkflowTool({ runtime: deps.runtime }))
	}

	if (deps.resolver && deps.runtime) {
		tools.push(createRequestApprovalTool({ runtime: deps.runtime, resolver: deps.resolver }))
	}

	if (deps.eventStore) {
		tools.push(createCheckStatusTool({ eventStore: deps.eventStore }))
		tools.push(createGetExecutionContextTool({ eventStore: deps.eventStore }))
		tools.push(createGetAwaitingNodesTool({ eventStore: deps.eventStore }))
		tools.push(createGetExecutionTimelineTool({ eventStore: deps.eventStore }))
		tools.push(createGetExecutionMetricsTool({ eventStore: deps.eventStore }))
		tools.push(createGetErrorDiagnosisTool({ eventStore: deps.eventStore }))
		tools.push(createWatchExecutionTool({ eventStore: deps.eventStore }))
	}

	if (deps.controllers) {
		tools.push(createCancelWorkflowTool({ controllers: deps.controllers }))
	}

	return tools
}

import type { ToolResult } from '../types'

export function normalizeResult(
	result: {
		status: string
		context?: {
			toJSON(): Record<string, unknown>
			_executionId?: string
			_awaitingNodeIds?: string[]
			_awaitingDetails?: Record<string, unknown>
		}
		serializedContext?: string
		errors?: Array<{ message: string; nodeId?: string }>
	},
	blueprintId: string,
	blueprintVersion?: string,
): ToolResult {
	const contextData = result.context?.toJSON() ?? {}
	const nodesExecuted = Object.keys(contextData._outputs ?? {})

	const base: ToolResult = {
		status: result.status as ToolResult['status'],
		data: contextData,
		executionId: result.context?._executionId,
		awaitingNodeIds: result.context?._awaitingNodeIds,
		awaitingDetails: result.context?._awaitingDetails,
		metadata: {
			duration: 0,
			nodesExecuted,
			blueprintId,
			blueprintVersion,
		},
	}

	if (result.errors?.length) {
		base.error = {
			message: result.errors[0].message,
		}
	}

	return base
}

export function createAsyncExecutionStore(): import('../types').AsyncExecutionStore {
	const executions = new Map<string, Promise<ToolResult>>()

	return {
		start(executionId: string, fn: () => Promise<ToolResult>) {
			executions.set(executionId, fn())
		},
		async get(executionId: string) {
			return executions.get(executionId)
		},
	}
}

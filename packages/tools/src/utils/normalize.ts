import type { ToolResult } from '../types'

export function normalizeResult(
	result: {
		status: string
		context?: Record<string, unknown> & {
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
	const contextData = (result.context ?? {}) as Record<string, unknown>
	const affectedNodes = Object.keys(contextData._outputs ?? {})

	const base: ToolResult = {
		status: result.status as ToolResult['status'],
		data: contextData,
		executionId: result.context?._executionId,
		awaitingNodeIds: result.context?._awaitingNodeIds,
		awaitingDetails: result.context?._awaitingDetails,
		metadata: {
			duration: 0,
			affectedNodes,
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
	const errors = new Map<string, Error>()

	return {
		start(executionId: string, fn: () => Promise<ToolResult>) {
			executions.set(
				executionId,
				fn().catch((err) => {
					errors.set(executionId, err instanceof Error ? err : new Error(String(err)))
					throw err
				}),
			)
		},
		async get(executionId: string) {
			const promise = executions.get(executionId)
			if (!promise) return undefined
			try {
				return await promise
			} catch {
				const error = errors.get(executionId)
				return {
					status: 'failed',
					error: { message: error?.message ?? 'Unknown error' },
					metadata: { duration: 0, affectedNodes: [], blueprintId: '' },
				}
			}
		},
	}
}

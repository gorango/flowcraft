import type { FlowcraftEvent, WorkflowResult } from '../../types'
import type { ExecutionContext } from '../execution-context'
import type { GraphTraverser } from '../traverser'
import type { IOrchestrator } from '../types'

/**
 * An orchestrator that replays a pre-recorded sequence of workflow events
 * to reconstruct the workflow state without executing any node logic.
 *
 * This enables time-travel debugging by allowing developers to inspect
 * the exact state of a workflow at any point in its execution history.
 */
export class ReplayOrchestrator implements IOrchestrator {
	/**
	 * Creates a new ReplayOrchestrator with a sequence of recorded workflow events.
	 *
	 * @param events - Array of FlowcraftEvent objects representing the recorded workflow execution
	 */
	constructor(private events: FlowcraftEvent[]) {}

	/**
	 * Replays the recorded workflow events to reconstruct the workflow state.
	 *
	 * This method filters events for the specific execution, applies each event in sequence
	 * to rebuild the context state, and returns the final reconstructed workflow result.
	 * Replayed executions always have a "completed" status since they reconstruct the final state.
	 *
	 * @param context - The execution context containing state and services
	 * @param _traverser - Graph traverser (unused in replay mode)
	 * @returns Promise resolving to the reconstructed workflow result
	 */
	async run(context: ExecutionContext<any, any>, _traverser: GraphTraverser): Promise<WorkflowResult<any>> {
		const executionEvents = this.events.filter((event) => {
			if ('executionId' in event.payload) {
				return event.payload.executionId === context.executionId
			}
			return false
		})

		const fallbackMap = new Map<string, string>()

		for (const event of executionEvents) {
			await this.applyEvent(event, context, fallbackMap)
		}

		const includeExecutionId = executionEvents.length > 0
		const result = await context.state.toResult(
			context.services.serializer,
			includeExecutionId ? context.executionId : undefined,
		)
		result.status = 'completed'
		return result
	}

	/**
	 * Applies a single workflow event to reconstruct the execution state.
	 *
	 * This method handles different event types by updating the workflow state accordingly,
	 * including node completions, context changes, errors, fallbacks, and workflow control events.
	 *
	 * @param event - The workflow event to apply
	 * @param context - The execution context to update
	 * @param fallbackMap - Map tracking fallback node relationships (fallbackNodeId -> originalNodeId)
	 */
	private async applyEvent(
		event: FlowcraftEvent,
		context: ExecutionContext<any, any>,
		fallbackMap: Map<string, string>,
	): Promise<void> {
		const { type, payload } = event

		switch (type) {
			case 'node:start':
				break

			case 'node:finish': {
				const originalNodeId = fallbackMap.get(payload.nodeId)
				if (originalNodeId) {
					await context.state.addCompletedNode(originalNodeId, payload.result.output)
				} else {
					await context.state.addCompletedNode(payload.nodeId, payload.result.output)
				}
				break
			}

			case 'context:change':
				if (payload.op === 'set') {
					await context.state.getContext().set(payload.key, payload.value)
				} else if (payload.op === 'delete') {
					await context.state.getContext().delete(payload.key)
				}
				break

			case 'node:error':
				context.state.addError(payload.nodeId, payload.error)
				break

			case 'node:fallback':
				fallbackMap.set(payload.fallback, payload.nodeId)
				context.state.markFallbackExecuted()
				break

			case 'node:retry':
				break

			case 'edge:evaluate':
				break

			case 'workflow:stall':
			case 'workflow:pause':
				if ('remainingNodes' in payload) {
					for (let i = 0; i < payload.remainingNodes; i++) {
						await context.state.markAsAwaiting(`node-${i}`)
					}
				}
				break

			case 'batch:start':
				break

			case 'batch:finish':
				for (const _result of payload.results) {
					// TODO?
				}
				break

			default:
				break
		}
	}
}

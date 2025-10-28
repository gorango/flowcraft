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
	constructor(private events: FlowcraftEvent[]) {}

	async run(context: ExecutionContext<any, any>, _traverser: GraphTraverser): Promise<WorkflowResult<any>> {
		// Filter events for this specific execution
		const executionEvents = this.events.filter((event) => {
			if ('executionId' in event.payload) {
				return event.payload.executionId === context.executionId
			}
			return false
		})

		// Sort events by timestamp if available, otherwise assume they're in order
		// For now, assume events are already in chronological order

		// Replay each event to reconstruct state
		for (const event of executionEvents) {
			await this.applyEvent(event, context)
		}

		// Return the final reconstructed state
		const result = await context.state.toResult(context.services.serializer, context.executionId)
		result.status = 'completed' // Replayed executions are always "completed"
		return result
	}

	private async applyEvent(event: FlowcraftEvent, context: ExecutionContext<any, any>): Promise<void> {
		const { type, payload } = event

		switch (type) {
			case 'node:start':
				// Node start doesn't change state directly, just marks intent
				break

			case 'node:finish':
				// Apply the recorded node output to the workflow state
				await context.state.addCompletedNode(payload.nodeId, payload.result.output)
				break

			case 'context:change':
				// Apply the recorded context change
				if (payload.op === 'set') {
					await context.state.getContext().set(payload.key, payload.value)
				} else if (payload.op === 'delete') {
					await context.state.getContext().delete(payload.key)
				}
				break

			case 'node:error':
				// Record the error in state
				context.state.addError(payload.nodeId, payload.error)
				break

			case 'node:fallback':
				// Mark that fallback was executed
				context.state.markFallbackExecuted()
				break

			case 'node:retry':
				// Track retry attempts - could be stored in context if needed
				break

			case 'edge:evaluate':
				// Edge evaluations don't change state directly
				break

			case 'workflow:stall':
			case 'workflow:pause':
				// Mark workflow as awaiting
				if ('remainingNodes' in payload) {
					// For stall events, mark all nodes as awaiting (simplified)
					for (let i = 0; i < payload.remainingNodes; i++) {
						await context.state.markAsAwaiting(`node-${i}`)
					}
				}
				break

			case 'batch:start':
				// Track batch operations if needed
				break

			case 'batch:finish':
				// Apply batch results
				for (const _result of payload.results) {
					// This assumes batch results are stored with node IDs
					// May need adjustment based on actual batch implementation
				}
				break

			default:
				// Ignore other events that don't affect state
				break
		}
	}
}

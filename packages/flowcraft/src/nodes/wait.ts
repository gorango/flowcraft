import { BaseNode } from '../node'
import type { NodeContext, NodeResult } from '../types'

export class WaitNode extends BaseNode {
	async exec(
		_prepResult: any,
		context: NodeContext<Record<string, any>, any, any>,
	): Promise<Omit<NodeResult, 'error'>> {
		await context.dependencies.workflowState.markAsAwaiting(this.nodeId ?? '', {
			reason: 'external_event',
			// params: this.params // NOTE: can add more details if needed in the future
		})
		return { output: undefined }
	}
}

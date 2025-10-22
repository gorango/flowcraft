import { BaseNode } from '../node'
import type { NodeContext, NodeResult } from '../types'

export class WaitNode extends BaseNode {
	async exec(
		_prepResult: any,
		context: NodeContext<Record<string, any>, any, any>,
	): Promise<Omit<NodeResult, 'error'>> {
		context.dependencies.workflowState.markAsAwaiting(this.nodeId ?? '')
		return { output: undefined }
	}
}

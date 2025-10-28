import { BaseNode } from '../node'
import type { NodeContext, NodeResult } from '../types'

export class SleepNode extends BaseNode {
	async exec(
		_prepResult: any,
		context: NodeContext<Record<string, any>, any, any>,
	): Promise<Omit<NodeResult, 'error'>> {
		const duration = this.params?.duration as number

		if (typeof duration !== 'number' || duration < 0)
			throw new Error(`SleepNode '${this.nodeId}' received an invalid duration.`)

		const wakeUpAt = new Date(Date.now() + duration).toISOString()

		context.dependencies.workflowState.markAsAwaiting(this.nodeId ?? '', {
			reason: 'timer',
			wakeUpAt,
		})

		return { output: undefined }
	}
}

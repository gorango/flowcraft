import { BaseNode } from '../node'
import type { NodeContext, NodeResult } from '../types'

export class SleepNode extends BaseNode {
	async exec(
		_prepResult: any,
		context: NodeContext<Record<string, any>, any, any>,
	): Promise<Omit<NodeResult, 'error'>> {
		const durationParam = this.params?.duration as string | number

		let durationMs: number
		if (typeof durationParam === 'string') {
			const match = durationParam.match(/^(\d+)([smhd])$/)
			if (!match) {
				throw new Error(
					`SleepNode '${this.nodeId}' received an invalid duration string: '${durationParam}'. Expected format: '5m', '10s', '1h', '2d'`,
				)
			}
			const [, numStr, unit] = match
			const num = parseInt(numStr, 10)
			switch (unit) {
				case 's':
					durationMs = num * 1000
					break
				case 'm':
					durationMs = num * 60 * 1000
					break
				case 'h':
					durationMs = num * 60 * 60 * 1000
					break
				case 'd':
					durationMs = num * 24 * 60 * 60 * 1000
					break
				default:
					throw new Error(`Invalid duration unit: ${unit}`)
			}
		} else if (typeof durationParam === 'number') {
			durationMs = durationParam
		} else {
			throw new Error(`SleepNode '${this.nodeId}' received an invalid duration type: ${typeof durationParam}`)
		}

		if (durationMs < 0) {
			throw new Error(`SleepNode '${this.nodeId}' received a negative duration.`)
		}

		const wakeUpAt = new Date(Date.now() + durationMs).toISOString()

		await context.dependencies.workflowState.markAsAwaiting(this.nodeId ?? '', {
			reason: 'timer',
			wakeUpAt,
		})

		return { output: undefined }
	}
}

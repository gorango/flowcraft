import { BaseNode } from '../node'
import type { Webhook } from '../sdk'
import type { NodeContext, NodeResult } from '../types'

export class WebhookNode extends BaseNode {
	async prep(context: NodeContext<Record<string, any>, any, any>): Promise<any> {
		const runId = context.dependencies.runtime.executionId
		const nodeId = this.nodeId ?? ''
		const adapter = (context.dependencies as any).adapter
		const { url, event } = await adapter.registerWebhookEndpoint(runId, nodeId)
		return { url, event }
	}

	async exec(
		prepResult: { url: string; event: string },
		_context: NodeContext<Record<string, any>, any, any>,
	): Promise<Omit<NodeResult, 'error'>> {
		const webhook: Webhook = {
			url: prepResult.url,
			event: prepResult.event,
			request: new Promise(() => {}), // will be resolved by the wait node
		}

		return { output: webhook }
	}
}

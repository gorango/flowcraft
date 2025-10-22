import { BaseNode } from '../node'
import type { NodeContext, NodeResult } from '../types'

export class BatchGatherNode extends BaseNode {
	async exec(_prepResult: any, context: NodeContext<any, any, any>): Promise<Omit<NodeResult, 'error'>> {
		const { gatherNodeId, outputKey } = (this.params as any) || {}
		const hasMore = (await context.context.get(`${gatherNodeId}_hasMore`)) || false
		const dynamicNodes: any[] = []
		let results: any[] = []
		if (hasMore) {
			// create a new scatter node for the next chunk
			const newScatterId = `${gatherNodeId}_scatter_next`
			dynamicNodes.push({
				id: newScatterId,
				uses: 'batch-scatter',
				inputs: context.input,
				params: { ...this.params, gatherNodeId },
			})
		} else {
			// collect results from all chunks into outputKey
			const allWorkerIds = ((await context.context.get(`${gatherNodeId}_allWorkerIds`)) as string[]) || []
			results = []
			for (const workerId of allWorkerIds) {
				const result = await context.context.get(`_outputs.${workerId}` as any)
				if (result !== undefined) results.push(result)
			}
			await context.context.set(outputKey as any, results)
		}
		return { dynamicNodes, output: results }
	}
}

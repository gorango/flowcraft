import { BaseNode } from '../node'
import type { NodeContext, NodeResult } from '../types'

export class BatchScatterNode extends BaseNode {
	async exec(_prepResult: any, context: NodeContext<any, any, any>): Promise<Omit<NodeResult, 'error'>> {
		const inputArray = context.input || []
		if (!Array.isArray(inputArray)) {
			throw new Error(`Input for batch-scatter node '${this.nodeId}' must be an array.`)
		}
		const { chunkSize = inputArray.length, workerUsesKey, gatherNodeId } = (this.params as any) || {}
		if (!workerUsesKey || !gatherNodeId) {
			throw new Error(`BatchScatterNode requires 'workerUsesKey' and 'gatherNodeId' parameters.`)
		}
		const batchId = globalThis.crypto.randomUUID()
		const currentIndex = (await context.context.get(`${this.nodeId}_currentIndex`)) || 0
		const endIndex = Math.min(currentIndex + chunkSize, inputArray.length)
		const dynamicNodes: any[] = []
		const workerIds = []
		for (let i = currentIndex; i < endIndex; i++) {
			const item = inputArray[i]
			const itemInputKey = `_batch.${this.nodeId}_${batchId}_item_${i}`
			await context.context.set(itemInputKey as any, item)
			const workerId = `${workerUsesKey}_${batchId}_${i}`
			workerIds.push(workerId)
			dynamicNodes.push({
				id: workerId,
				uses: workerUsesKey,
				inputs: itemInputKey,
			})
		}

		const parentBatchId = this.nodeId?.replace('_scatter', '') || ''
		await context.dependencies.runtime.services.eventBus.emit({
			type: 'batch:start',
			payload: {
				batchId: parentBatchId,
				scatterNodeId: this.nodeId,
				workerNodeIds: workerIds,
			},
		})

		await context.context.set(`${this.nodeId}_currentIndex`, endIndex)
		const hasMore = endIndex < inputArray.length
		await context.context.set(`${gatherNodeId}_hasMore`, hasMore)
		const existingWorkerIds = (await context.context.get(`${gatherNodeId}_allWorkerIds`)) || []
		const allWorkerIds = [...existingWorkerIds, ...workerIds]
		await context.context.set(`${gatherNodeId}_allWorkerIds`, allWorkerIds)
		return { dynamicNodes, output: { gatherNodeId, hasMore } }
	}
}

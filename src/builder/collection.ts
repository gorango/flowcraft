import type { AbstractNode, NodeArgs } from '../workflow'
import { Flow } from '../workflow'

/**
 * A builder that creates a linear flow from a sequence of nodes.
 * It is the underlying implementation for `Flow.sequence()`.
 */
export class SequenceFlow extends Flow {
	constructor(...nodes: AbstractNode[]) {
		if (nodes.length === 0) {
			super()
			return
		}
		super(nodes[0])
		let current = nodes[0]
		for (let i = 1; i < nodes.length; i++)
			current = current.next(nodes[i])
	}
}

/**
 * A flow that executes its workflow sequentially for each item in a collection.
 */
export class BatchFlow extends Flow {
	/**
	 * Prepares the list of items to be processed.
	 * @returns An array or iterable of parameter objects, one for each item.
	 */
	async prep(args: NodeArgs): Promise<Iterable<any>> {
		return []
	}

	async exec(args: NodeArgs): Promise<null> {
		const combinedParams = { ...this.params, ...args.params }
		const batchParamsIterable = (await this.prep(args)) || []
		const batchParamsList = Array.from(batchParamsIterable)
		args.logger.info(`BatchFlow: Starting sequential processing of ${batchParamsList.length} items.`)
		for (const [index, batchParams] of batchParamsList.entries()) {
			args.logger.debug(`BatchFlow: Processing item ${index + 1}/${batchParamsList.length}.`, { params: batchParams })
			await this._orch(args.ctx, { ...combinedParams, ...batchParams }, args.signal, args.logger)
		}
		return null
	}
}

/**
 * A flow that executes its workflow in parallel for each item in a collection.
 */
export class ParallelBatchFlow extends Flow {
	/**
	 * Prepares the list of items to be processed.
	 * @returns An array or iterable of parameter objects, one for each item.
	 */
	async prep(args: NodeArgs): Promise<Iterable<any>> {
		return []
	}

	async exec(args: NodeArgs<any, void>): Promise<any> {
		const combinedParams = { ...this.params, ...args.params }
		const batchParamsIterable = (await this.prep(args)) || []
		const batchParamsList = Array.from(batchParamsIterable)
		args.logger.info(`ParallelBatchFlow: Starting parallel processing of ${batchParamsList.length} items.`)
		const promises = batchParamsList.map(batchParams =>
			this._orch(args.ctx, { ...combinedParams, ...batchParams }, args.signal, args.logger),
		)
		await Promise.all(promises)
		return null
	}
}

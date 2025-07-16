import type { NodeArgs } from '../workflow'
import { Flow } from '../workflow'

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

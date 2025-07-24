import type { AbstractNode, NodeArgs } from 'cascade'
import { Flow, Node } from 'cascade'
import { getEmbedding } from '../utils'
import { CHUNKS, EMBEDDINGS } from './index'

// Modified from the ParallelBatchFlow to return the items from the batch.
class ParallelBatchFlow extends Flow {
	constructor(protected nodeToRun: AbstractNode) {
		super()
	}

	async prep(_args: NodeArgs): Promise<Iterable<any>> {
		return []
	}

	async exec(args: NodeArgs<any, void>): Promise<any> {
		if (!this.nodeToRun)
			return null

		const combinedParams = { ...this.params, ...args.params }
		const batchParamsIterable = (await this.prep(args)) || []
		const batchParamsList = Array.from(batchParamsIterable)
		args.logger.info(`ParallelBatchFlow: Starting parallel processing of ${batchParamsList.length} items.`)

		const promises = batchParamsList.map((batchParams) => {
			return this.nodeToRun._run({
				ctx: args.ctx,
				params: { ...combinedParams, ...batchParams },
				signal: args.signal,
				logger: args.logger,
				executor: args.executor,
			})
		})

		return Promise.all(promises)
	}
}

// The "worker" node that processes a single item from the batch.
class GetSingleEmbeddingNode extends Node<{ chunkId: string, text: string }, { chunkId: string, vector: number[] }> {
	async exec({ params }: NodeArgs) {
		const vector = await getEmbedding(params.text)
		return { chunkId: params.chunkId, vector }
	}

	async post({ execRes }: NodeArgs) {
		return execRes
	}
}

// This is the main orchestrator node for this step.
export class GenerateEmbeddingsNode extends ParallelBatchFlow {
	constructor() {
		// The `ParallelBatchFlow` will run an instance of `GetSingleEmbeddingNode` for each item.
		super(new GetSingleEmbeddingNode())
	}

	// The `prep` phase gathers the items to be processed in parallel.
	async prep({ ctx }: NodeArgs) {
		const chunks = ctx.get(CHUNKS)
		if (!chunks)
			return []

		// Return an array of parameter objects for the batch processor.
		return Array.from(chunks.values()).map(chunk => ({
			chunkId: chunk.id,
			text: chunk.text,
		}))
	}

	// The `post` phase runs after all parallel jobs are complete to aggregate the results.
	async post({ ctx, execRes, logger }: NodeArgs) {
		const embeddings = new Map<string, number[]>()
		const batchResults = execRes as { chunkId: string, vector: number[] }[] | undefined

		if (batchResults) {
			for (const result of batchResults) {
				if (result)
					embeddings.set(result.chunkId, result.vector)
			}
		}

		ctx.set(EMBEDDINGS, embeddings)
		logger?.info(`[GenerateEmbeddingsNode] Generated ${embeddings.size} embeddings.`)
	}
}

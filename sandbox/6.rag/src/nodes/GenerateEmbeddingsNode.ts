import type { AbstractNode, NodeArgs } from 'cascade'
import { Node, ParallelBatchFlow } from 'cascade'
import { getEmbedding } from '../utils'
import { CHUNKS, EMBEDDINGS } from './index'

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
	protected nodeToRun: AbstractNode = new GetSingleEmbeddingNode()

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
		const batchResults = execRes as PromiseSettledResult<{ chunkId: string, vector: number[] }>[] | undefined

		if (batchResults) {
			for (const result of batchResults) {
				if (result.status === 'fulfilled' && result.value) {
					embeddings.set(result.value.chunkId, result.value.vector)
				}
				else if (result.status === 'rejected') {
					logger?.error('[GenerateEmbeddingsNode] A batch embedding generation failed.', { error: result.reason })
				}
			}
		}

		ctx.set(EMBEDDINGS, embeddings)
		logger?.info(`[GenerateEmbeddingsNode] Generated ${embeddings.size} embeddings.`)
	}
}

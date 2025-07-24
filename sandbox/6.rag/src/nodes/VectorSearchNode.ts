import type { NodeArgs } from 'cascade'
import type { RagNodeOptions } from '../types'
import { Node } from 'cascade'
import { SearchResult } from '../types'
import { cosineSimilarity, getEmbedding } from '../utils'
import { SEARCH_RESULTS, VECTOR_DB } from './index'

export class VectorSearchNode extends Node<void, SearchResult[]> {
	private question: string
	private topK: number

	constructor(options: RagNodeOptions<'vector-search'>) {
		super(options)
		this.question = options.data.question
		this.topK = options.data.topK
	}

	async exec({ ctx, logger }: NodeArgs): Promise<SearchResult[]> {
		logger.info(`[VectorSearchNode] Performing vector search for question: "${this.question}"`)
		const db = ctx.get(VECTOR_DB)
		if (!db || db.size === 0) {
			logger.warn('[VectorSearchNode] Vector DB is empty. Cannot perform search.')
			return []
		}

		// 1. Get the embedding for the user's question.
		const questionVector = await getEmbedding(this.question)

		// 2. Calculate similarity between the question and all document chunks.
		const similarities: { id: string, score: number }[] = []
		for (const [chunkId, { vector }] of db.entries()) {
			const score = cosineSimilarity(questionVector, vector)
			similarities.push({ id: chunkId, score })
		}

		// 3. Sort by score and take the top K results.
		similarities.sort((a, b) => b.score - a.score)
		const topResults = similarities.slice(0, this.topK)

		// 4. Create SearchResult instances.
		const searchResults = topResults.map(({ id, score }) => {
			const chunk = db.get(id)!.chunk
			return new SearchResult(chunk, score)
		})

		logger.info(`[VectorSearchNode] Found ${searchResults.length} relevant results.`)
		return searchResults
	}

	async post({ ctx, execRes }: NodeArgs<void, SearchResult[]>) {
		ctx.set(SEARCH_RESULTS, execRes)
	}
}

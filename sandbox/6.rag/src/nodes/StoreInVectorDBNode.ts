import type { NodeArgs } from 'flowcraft'
import type { DocumentChunk, RagContext } from '../types'
import { Node } from 'flowcraft'
import { CHUNKS, EMBEDDINGS, VECTOR_DB } from './index'

export class StoreInVectorDBNode extends Node {
	constructor(options?: RagContext) {
		super(options)
	}

	async exec({ ctx, logger }: NodeArgs) {
		logger.info('[StoreInVectorDBNode] Simulating storage of chunks and vectors.')

		const chunks = ctx.get(CHUNKS)
		const embeddings = ctx.get(EMBEDDINGS)

		if (!chunks || !embeddings) {
			throw new Error('Missing chunks or embeddings in context.')
		}

		const db = new Map<string, { chunk: DocumentChunk, vector: number[] }>()

		for (const [chunkId, chunk] of chunks.entries()) {
			const vector = embeddings.get(chunkId)
			if (vector) {
				db.set(chunkId, { chunk, vector })
			}
			else {
				logger.warn(`[StoreInVectorDBNode] No embedding found for chunk ID: ${chunkId}`)
			}
		}

		logger.info(`[StoreInVectorDBNode] DB is ready with ${db.size} entries.`)
		ctx.set(VECTOR_DB, db)
	}
}

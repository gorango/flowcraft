import type { NodeArgs } from 'flowcraft'
import type { RagContext, RagNodeOptions } from '../types'
import { promises as fs } from 'node:fs'
import { Node } from 'flowcraft'
import { DocumentChunk } from '../types'
import { CHUNKS, DOCUMENT_PATH } from './index'

export class LoadAndChunkNode extends Node<string, Map<string, DocumentChunk>> {
	private filePath: string

	constructor(options: RagNodeOptions<'load-and-chunk'> & RagContext) {
		super(options)
		this.filePath = options.data.filePath
	}

	async exec({ ctx, logger }: NodeArgs): Promise<Map<string, DocumentChunk>> {
		const path = (await ctx.get(DOCUMENT_PATH)) || this.filePath
		logger.info(`[LoadAndChunkNode] Reading and chunking file: ${path}`)

		const content = await fs.readFile(path, 'utf-8')
		const chunks = new Map<string, DocumentChunk>()

		// Simple chunking strategy: split by paragraph.
		// A real implementation might use a more sophisticated text splitter.
		const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 10)

		for (const [i, paragraph] of paragraphs.entries()) {
			const chunkId = `chunk_${i}`
			const chunk = new DocumentChunk(chunkId, paragraph.trim(), this.filePath)
			chunks.set(chunkId, chunk)
		}

		logger.info(`[LoadAndChunkNode] Created ${chunks.size} chunks.`)
		return chunks
	}

	async post({ ctx, execRes }: NodeArgs<string, Map<string, DocumentChunk>>) {
		await ctx.set(CHUNKS, execRes)
	}
}

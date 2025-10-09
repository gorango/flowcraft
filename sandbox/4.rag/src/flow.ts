import type { NodeContext, NodeResult, ISyncContext } from 'flowcraft'
import * as fs from 'node:fs/promises'
import { createFlow } from 'flowcraft'
import { DocumentChunk, SearchResult } from './types.js'
import { callLLM, cosineSimilarity, getEmbedding, resolveTemplate } from './utils.js'

interface RagContext {
	document_path: string
	question: string
	chunks: Map<string, DocumentChunk>
	embeddings: Map<string, number[]>
	vector_db: Map<string, { chunk: DocumentChunk, vector: number[] }>
	search_results: SearchResult[]
	final_answer: string
}

async function loadAndChunk(ctx: NodeContext<RagContext>): Promise<NodeResult> {
	const syncContext = ctx.context as ISyncContext<RagContext>
	const path = syncContext.get('document_path')!
	console.log(`[Node] Reading and chunking file: ${path}`)

	const content = await fs.readFile(path!, 'utf-8')
	const chunks = new Map<string, DocumentChunk>()
	const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 10)

	for (const [i, paragraph] of paragraphs.entries()) {
		const chunkId = `chunk_${i}`
		const chunk = new DocumentChunk(chunkId, paragraph.trim(), path!)
		chunks.set(chunkId, chunk)
	}
	syncContext.set('chunks', chunks)
	console.log(`[Node] Created ${chunks.size} chunks.`)
	return { output: Array.from(chunks.values()) }
}

async function generateSingleEmbedding(ctx: NodeContext<RagContext>): Promise<NodeResult> {
	const chunk = ctx.input
	if (!chunk || !chunk.text) {
		throw new TypeError('Batch worker for embeddings received an invalid chunk.')
	}
	const vector = await getEmbedding(chunk.text)
	return { output: { chunkId: chunk.id, vector } }
}

async function storeInVectorDB(ctx: NodeContext<RagContext>): Promise<NodeResult> {
	console.log('[Node] Simulating storage of chunks and vectors.')
	const embeddingResults = ctx.input as { chunkId: string, vector: number[] }[]
	const syncContext = ctx.context as ISyncContext<RagContext>
	const chunks = syncContext.get('chunks') as Map<string, DocumentChunk>
	const db = new Map<string, { chunk: DocumentChunk, vector: number[] }>()

	for (const { chunkId, vector } of embeddingResults) {
		const chunk = chunks.get(chunkId)
		if (chunk && vector) {
			db.set(chunkId, { chunk, vector })
		}
	}
	syncContext.set('vector_db', db)
	console.log(`[Node] DB is ready with ${db.size} entries.`)
	return { output: 'DB Ready' }
}

async function vectorSearch(ctx: NodeContext<RagContext>): Promise<NodeResult> {
	const syncContext = ctx.context as ISyncContext<RagContext>
	const question = syncContext.get('question')!
	const db = syncContext.get('vector_db') as Map<string, { chunk: DocumentChunk, vector: number[] }>
	console.log(`[Node] Performing vector search for question: "${question}"`)

	const questionVector = await getEmbedding(question!)
	const similarities: { id: string, score: number }[] = []
	for (const [chunkId, { vector }] of db.entries()) {
		const score = cosineSimilarity(questionVector, vector)
		similarities.push({ id: chunkId, score })
	}

	similarities.sort((a, b) => b.score - a.score)
	const topResults = similarities.slice(0, 2)

	const searchResults = topResults.map(({ id, score }) => {
		const chunk = db.get(id)!.chunk
		return new SearchResult(chunk, score)
	})
	syncContext.set('search_results', searchResults)
	console.log(`[Node] Found ${searchResults.length} relevant results.`)
	return { output: searchResults }
}

async function generateFinalAnswer(ctx: NodeContext<RagContext>): Promise<NodeResult> {
	const searchResults = ctx.input as SearchResult[]
	const contextText = searchResults?.map(r => r.chunk.text).join('\n\n---\n\n') ?? ''
	const syncContext = ctx.context as ISyncContext<RagContext>
	const question = syncContext.get('question')!
	const prompt = resolveTemplate(
		'Based on the following context, please provide a clear and concise answer to the user\'s question.\n\n**CONTEXT**\n\n{{context}}\n\n**QUESTION**\n\n{{question}}\n\n**ANSWER**',
		{ context: contextText, question },
	)
	const answer = await callLLM(prompt)
	syncContext.set('final_answer', answer)
	return { output: answer }
}

// --- Flow Definition ---

export function createRagFlow() {
	return createFlow<RagContext>('advanced-rag-agent')
		.node('load_and_chunk', loadAndChunk)
		.node('store_in_db', storeInVectorDB)
		.node('vector_search', vectorSearch)
		.node('generate_final_answer', generateFinalAnswer)

		// Use the batch method to process embeddings in parallel
		.batch('load_and_chunk', 'store_in_db', generateSingleEmbedding, { concurrency: 5 })

		// Wire the graph edges
		.edge('store_in_db', 'vector_search')
		.edge('vector_search', 'generate_final_answer')
}

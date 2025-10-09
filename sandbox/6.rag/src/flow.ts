import type { NodeContext, NodeResult } from 'flowcraft'
import * as fs from 'node:fs/promises'
import { createFlow } from 'flowcraft'
import { DocumentChunk, SearchResult } from './types.js'
import { callLLM, cosineSimilarity, getEmbedding, resolveTemplate } from './utils.js'

// Define the shape of the context for type safety
interface RagContext {
	document_path: string
	question: string
	chunks: Map<string, DocumentChunk>
	embeddings: Map<string, number[]>
	vector_db: Map<string, { chunk: DocumentChunk, vector: number[] }>
	search_results: SearchResult[]
	final_answer: string
}

// --- Node Functions ---

async function loadAndChunk(ctx: NodeContext<RagContext>): Promise<NodeResult> {
	const path = ctx.get('document_path')!
	console.log(`[Node] Reading and chunking file: ${path}`)

	const content = await fs.readFile(path, 'utf-8')
	const chunks = new Map<string, DocumentChunk>()
	const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 10)

	for (const [i, paragraph] of paragraphs.entries()) {
		const chunkId = `chunk_${i}`
		const chunk = new DocumentChunk(chunkId, paragraph.trim(), path)
		chunks.set(chunkId, chunk)
	}
	ctx.set('chunks', chunks)
	console.log(`[Node] Created ${chunks.size} chunks.`)
	return { output: Array.from(chunks.values()) }
}

// CORRECTED: The `input` is the DocumentChunk itself, not an object containing it.
async function generateSingleEmbedding(ctx: NodeContext<DocumentChunk>): Promise<NodeResult> {
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
	const chunks = ctx.get('chunks')!
	const db = new Map<string, { chunk: DocumentChunk, vector: number[] }>()

	for (const { chunkId, vector } of embeddingResults) {
		const chunk = chunks.get(chunkId)
		if (chunk && vector) {
			db.set(chunkId, { chunk, vector })
		}
	}
	ctx.set('vector_db', db)
	console.log(`[Node] DB is ready with ${db.size} entries.`)
	return { output: 'DB Ready' }
}

async function vectorSearch(ctx: NodeContext<RagContext>): Promise<NodeResult> {
	const question = ctx.get('question')!
	const db = ctx.get('vector_db')!
	console.log(`[Node] Performing vector search for question: "${question}"`)

	const questionVector = await getEmbedding(question)
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
	ctx.set('search_results', searchResults)
	console.log(`[Node] Found ${searchResults.length} relevant results.`)
	return { output: searchResults }
}

async function generateFinalAnswer(ctx: NodeContext<RagContext>): Promise<NodeResult> {
	const searchResults = ctx.input as SearchResult[]
	const contextText = searchResults?.map(r => r.chunk.text).join('\n\n---\n\n') ?? ''
	const question = ctx.get('question')!
	const prompt = resolveTemplate(
		'Based on the following context, please provide a clear and concise answer to the user\'s question.\n\n**CONTEXT**\n\n{{context}}\n\n**QUESTION**\n\n{{question}}\n\n**ANSWER**',
		{ context: contextText, question },
	)
	const answer = await callLLM(prompt)
	ctx.set('final_answer', answer)
	return { output: answer }
}

// --- Flow Definition ---

export function createRagFlow() {
	return createFlow<RagContext>('advanced-rag-agent')
		.node('load_and_chunk', loadAndChunk)
		.node('generate_embedding_worker', generateSingleEmbedding)
		.node('store_in_db', storeInVectorDB)
		.node('vector_search', vectorSearch)
		.node('generate_final_answer', generateFinalAnswer)

		// The batch helper wires the source to the worker.
		.batch('load_and_chunk', 'generate_embedding_worker', { concurrency: 5 })

		// The edge from the worker defines what happens after the *entire batch* is done.
		.edge('generate_embedding_worker', 'store_in_db')
		.edge('store_in_db', 'vector_search')
		.edge('vector_search', 'generate_final_answer')
}

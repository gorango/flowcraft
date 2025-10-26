import * as fs from 'node:fs/promises'
import type { NodeContext, NodeResult } from 'flowcraft'
import { createFlow } from 'flowcraft'
import { DocumentChunk, SearchResult } from './types.js'
import { callLLM, cosineSimilarity, getEmbedding, resolveTemplate } from './utils.js'

interface RagContext {
	document_path: string
	question: string
	vector_db: Map<string, { chunk: DocumentChunk; vector: number[] }>
	search_results: SearchResult[]
	final_answer: string
	// For batch processing
	load_and_chunk: DocumentChunk[]
	embedding_results: { chunk: DocumentChunk; vector: number[] }[]
}

async function loadAndChunk(ctx: NodeContext<RagContext>): Promise<NodeResult> {
	const path = await ctx.context.get('document_path')
	if (!path) {
		throw new TypeError('document_path is required')
	}
	console.log(`[Node] Reading and chunking file: ${path}`)

	const content = await fs.readFile(path, 'utf-8')
	const chunks = new Map<string, DocumentChunk>()
	const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim().length > 10)

	for (const [i, paragraph] of paragraphs.entries()) {
		const chunkId = `chunk_${i}`
		const chunk = new DocumentChunk(chunkId, paragraph.trim(), path)
		chunks.set(chunkId, chunk)
	}
	console.log(`[Node] Created ${chunks.size} chunks.`)
	// The runtime will store this output array in the context under the key 'load_and_chunk'.
	return { output: Array.from(chunks.values()) }
}

async function generateSingleEmbedding(
	ctx: NodeContext<RagContext, any, DocumentChunk>,
): Promise<NodeResult<{ chunk: DocumentChunk; vector: number[] }>> {
	const chunk = ctx.input
	if (!chunk || !chunk.text) {
		throw new TypeError('Batch worker for embeddings received an invalid chunk.')
	}
	const vector = await getEmbedding(chunk.text)
	return { output: { chunk, vector } }
}

async function storeInVectorDB(
	ctx: NodeContext<RagContext, any, { chunk: DocumentChunk; vector: number[] }[]>,
): Promise<NodeResult<string>> {
	console.log('[Node] Simulating storage of chunks and vectors.')
	const embeddingResults = ctx.input
	const db = new Map<string, { chunk: DocumentChunk; vector: number[] }>()

	if (!embeddingResults || embeddingResults.length === 0) {
		console.warn('[Node] No embedding results to store in DB. Upstream might have failed.')
		return { output: 'DB Ready (empty)' }
	}

	for (const { chunk, vector } of embeddingResults) {
		if (chunk && vector) {
			db.set(chunk.id, { chunk, vector })
		}
	}
	await ctx.context.set('vector_db', db)
	console.log(`[Node] DB is ready with ${db.size} entries.`)
	return { output: 'DB Ready' }
}

async function vectorSearch(ctx: NodeContext<RagContext>): Promise<NodeResult> {
	const question = await ctx.context.get('question')
	const db = await ctx.context.get('vector_db')
	console.log(`[Node] Performing vector search for question: "${question}"`)

	if (!db || db.size === 0) {
		console.error('[Node] Vector DB is empty. Cannot perform search.')
		return { output: [] }
	}

	if (!question) {
		throw new TypeError('question is required')
	}

	const questionVector = await getEmbedding(question)
	const similarities: { id: string; score: number }[] = []
	for (const [chunkId, { vector }] of db.entries()) {
		const score = cosineSimilarity(questionVector, vector)
		similarities.push({ id: chunkId, score })
	}

	similarities.sort((a, b) => b.score - a.score)
	const topResults = similarities.slice(0, 2)

	const searchResults = topResults.map(({ id, score }) => {
		const entry = db.get(id)
		if (!entry) {
			throw new TypeError(`Chunk ${id} not found in DB`)
		}
		return new SearchResult(entry.chunk, score)
	})
	await ctx.context.set('search_results', searchResults)
	console.log(`[Node] Found ${searchResults.length} relevant results.`)
	return { output: searchResults }
}

async function generateFinalAnswer(ctx: NodeContext<RagContext, any, SearchResult[]>): Promise<NodeResult<string>> {
	const searchResults = ctx.input
	const contextText = searchResults?.map((r) => r.chunk.text).join('\n\n---\n\n') ?? 'No context found.'
	const question = await ctx.context.get('question')
	if (!question) {
		throw new TypeError('question is required')
	}
	const prompt = resolveTemplate(
		"Based on the following context, please provide a clear and concise answer to the user's question.\n\n**CONTEXT**\n\n{{context}}\n\n**QUESTION**\n\n{{question}}\n\n**ANSWER**",
		{ context: contextText, question },
	)
	const answer = await callLLM(prompt)
	await ctx.context.set('final_answer', answer)
	return { output: answer }
}

// --- Flow Definition ---

export function createRagFlow() {
	return (
		createFlow<RagContext>('advanced-rag-agent')
			// 1. Define the standard nodes
			.node('load_and_chunk', loadAndChunk)
			.node('store_in_db', storeInVectorDB, { inputs: 'embedding_results' })
			.node('vector_search', vectorSearch)
			.node('generate_final_answer', generateFinalAnswer)

			// 2. Define the parallel batch processing step
			.batch('generate-embeddings', generateSingleEmbedding, {
				// This tells the batch scatter node where to find the input array
				inputKey: 'load_and_chunk',
				// This tells the batch gather node where to save the final results array
				outputKey: 'embedding_results',
			})

			// 3. Wire the graph edges to connect the steps
			.edge('load_and_chunk', 'generate-embeddings_scatter')
			// Connect the batch gatherer to the next step. The data flow is now
			// handled by the `inputs` mapping on the 'store_in_db' node itself.
			.edge('generate-embeddings_gather', 'store_in_db')
			.edge('store_in_db', 'vector_search')
			.edge('vector_search', 'generate_final_answer')
	)
}

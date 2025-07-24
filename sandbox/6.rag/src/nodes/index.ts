import type { DocumentChunk, SearchResult } from '../types'
import { contextKey } from 'cascade'

// These are the type-safe keys we'll use to pass state through the workflow.
export const DOCUMENT_PATH = contextKey<string>('document_path')
export const CHUNKS = contextKey<Map<string, DocumentChunk>>('chunks')
export const EMBEDDINGS = contextKey<Map<string, number[]>>('embeddings')
export const VECTOR_DB = contextKey<Map<string, { chunk: DocumentChunk, vector: number[] }>>('vector_db')
export const QUESTION = contextKey<string>('question')
export const SEARCH_RESULTS = contextKey<SearchResult[]>('search_results')
export const FINAL_ANSWER = contextKey<string>('final_answer')

// A map to resolve string names from the JSON graph to our actual ContextKey symbols.
export const keyRegistry = new Map<string, symbol>([
	['document_path', DOCUMENT_PATH],
	['chunks', CHUNKS],
	['embeddings', EMBEDDINGS],
	['vector_db', VECTOR_DB],
	['question', QUESTION],
	['search_results', SEARCH_RESULTS],
	['final_answer', FINAL_ANSWER],
])

export * from './GenerateEmbeddingsNode'
export * from './LLMProcessNode'
export * from './LoadAndChunkNode'
export * from './StoreInVectorDBNode'
export * from './VectorSearchNode'

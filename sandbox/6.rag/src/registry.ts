import type { TypedNodeRegistry } from 'cascade'
import type { RagNodeTypeMap } from './types'
import { createNodeRegistry, GraphBuilder } from 'cascade'
import {
	GenerateEmbeddingsNode,
	LLMProcessNode,
	LoadAndChunkNode,
	StoreInVectorDBNode,
	VectorSearchNode,
} from './nodes'

// Create a type-safe registry that maps our node type strings to their classes.
export const nodeRegistry = createNodeRegistry({
	'load-and-chunk': LoadAndChunkNode,
	'generate-embeddings': GenerateEmbeddingsNode,
	'store-in-db': StoreInVectorDBNode,
	'vector-search': VectorSearchNode,
	'llm-process': LLMProcessNode,
} as TypedNodeRegistry<RagNodeTypeMap>)

// Instantiate the GraphBuilder with our registry.
// This builder will be used in main.ts to construct the flow.
export const ragGraphBuilder = new GraphBuilder<RagNodeTypeMap>(nodeRegistry)

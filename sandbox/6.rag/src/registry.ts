import type { TypedNodeRegistry } from 'flowcraft'
import type { RagContext, RagNodeTypeMap } from './types'
import { createNodeRegistry, GraphBuilder } from 'flowcraft'
import {
	GenerateEmbeddingsNode,
	LLMProcessNode,
	LoadAndChunkNode,
	StoreInVectorDBNode,
	VectorSearchNode,
} from './nodes'

export const nodeRegistry = createNodeRegistry<RagNodeTypeMap, RagContext>({
	'load-and-chunk': LoadAndChunkNode,
	'generate-embeddings': GenerateEmbeddingsNode,
	'store-in-db': StoreInVectorDBNode,
	'vector-search': VectorSearchNode,
	'llm-process': LLMProcessNode,
} as TypedNodeRegistry<RagNodeTypeMap>)

// Instantiate the GraphBuilder with our registry.
// This builder will be used in main.ts to construct the flow.
export const ragGraphBuilder = new GraphBuilder<RagNodeTypeMap, RagContext>(nodeRegistry)

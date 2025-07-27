import type { NodeConstructorOptions, NodeOptions } from 'flowcraft'

// A class representing a single chunk of a document.
// Using a class demonstrates a common data modeling pattern.
export class DocumentChunk {
	constructor(
		public readonly id: string,
		public readonly text: string,
		public readonly source: string,
		public readonly ingestedAt: Date = new Date(),
	) { }
}

// A class representing a search result from the vector database.
export class SearchResult {
	constructor(
		public readonly chunk: DocumentChunk,
		public readonly score: number,
	) { }
}

// A type-safe mapping of our graph node types to their expected `data` payloads.
// This will be used by the GraphBuilder for compile-time validation.
export interface RagNodeTypeMap {
	'load-and-chunk': {
		filePath: string
	}
	// This node will read from context, so its data payload is minimal.
	'generate-embeddings': object
	// This node will read from context, so its data payload is minimal.
	'store-in-db': object
	'vector-search': {
		question: string
		topK: number
	}
	'llm-process': {
		promptTemplate: string
		inputs: Record<string, string>
	}
}

// The options object passed to each node's constructor by the GraphBuilder.
export type RagNodeOptions<T extends keyof RagNodeTypeMap>
	= & NodeConstructorOptions<RagNodeTypeMap[T]> & NodeOptions

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

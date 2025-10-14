export class DocumentChunk {
	constructor(
		public readonly id: string,
		public readonly text: string,
		public readonly source: string,
		public readonly ingestedAt: Date = new Date(),
	) { }
}

export class SearchResult {
	constructor(
		public readonly chunk: DocumentChunk,
		public readonly score: number,
	) { }
}

import type { ExecutionMetadata, IContext } from './types'

/**
 * Context implementation that provides async access to workflow state.
 * Serialization for complex types is handled by a pluggable serializer in the Runtime.
 */
export class Context<TContext extends Record<string, any> = Record<string, any>>
implements IContext<TContext> {
	private data: Map<string, any>
	private metadata: ExecutionMetadata

	constructor(
		initialData: Partial<TContext> = {},
		metadata: ExecutionMetadata,
	) {
		this.data = new Map(Object.entries(initialData))
		this.metadata = metadata
	}

	/**
	 * Get a value from the context with full type safety
	 */
	async get<K extends keyof TContext>(key: K): Promise<TContext[K] | undefined> {
		return Promise.resolve(this.data.get(String(key)) as TContext[K] | undefined)
	}

	/**
	 * Set a value in the context with full type safety
	 */
	async set<K extends keyof TContext>(key: K, value: TContext[K]): Promise<this> {
		this.data.set(String(key), value)
		return Promise.resolve(this)
	}

	/**
	 * Check if a key exists in the context
	 */
	async has(key: keyof TContext): Promise<boolean> {
		return Promise.resolve(this.data.has(String(key)))
	}

	/**
	 * Delete a key from the context
	 */
	async delete(key: keyof TContext): Promise<boolean> {
		return Promise.resolve(this.data.delete(String(key)))
	}

	/**
	 * Get all context keys
	 */
	async keys(): Promise<string[]> {
		return Promise.resolve(Array.from(this.data.keys()))
	}

	/**
	 * Get all context values
	 */
	values(): any[] {
		return Array.from(this.data.values())
	}

	/**
	 * Get all context entries
	 */
	entries(): [string, any][] {
		return Array.from(this.data.entries())
	}

	/**
	 * Get the size of the context
	 */
	get size(): number {
		return this.data.size
	}

	/**
	 * Convert context to a plain object. This is the default serialization method.
	 */
	async toJSON(): Promise<Record<string, any>> {
		return Promise.resolve(Object.fromEntries(this.data))
	}

	/**
	 * Create a context from a plain object. This is the default deserialization method.
	 */
	static fromJSON<TContext extends Record<string, any>>(
		data: Record<string, any>,
		metadata: ExecutionMetadata,
	): Context<TContext> {
		return new Context<TContext>(data as any, metadata)
	}

	/**
	 * Updates the metadata of the current context in-place.
	 */
	setMetadata(metadata: Partial<ExecutionMetadata>): this {
		this.metadata = { ...this.metadata, ...metadata }
		return this
	}

	/**
	 * Create a scoped context for sub-workflows
	 */
	createScope(additionalData: Record<string, any> = {}): IContext<TContext> {
		const currentData = Object.fromEntries(this.data)
		const mergedData = { ...currentData, ...additionalData }
		return new Context<TContext>(mergedData as Partial<TContext>, this.metadata)
	}

	/**
	 * Merges data from another context into this one, overwriting existing keys.
	 */
	async merge(other: IContext<any>): Promise<void> {
		const otherData = await other.toJSON()
		for (const [key, value] of Object.entries(otherData)) {
			this.data.set(key, value)
		}
	}

	/**
	 * Synchronous version of merge for Context-to-Context operations.
	 */
	mergeSync(other: Context<any>): void {
		for (const [key, value] of other.entries()) {
			this.data.set(key, value)
		}
	}

	/**
	 * Get execution metadata
	 */
	getMetadata(): ExecutionMetadata {
		return this.metadata
	}
}

/**
 * Create a new context with the given data and metadata
 */
export function createContext<TContext extends Record<string, any> = Record<string, any>>(
	initialData: Partial<TContext> = {},
	metadata: ExecutionMetadata,
): Context<TContext> {
	return new Context(initialData, metadata)
}

/**
 * Create a new async context with the given data and metadata
 */
export function createAsyncContext<TContext extends Record<string, any> = Record<string, any>>(
	initialData: Partial<TContext> = {},
	metadata: ExecutionMetadata,
): IContext<TContext> {
	return new Context(initialData, metadata)
}

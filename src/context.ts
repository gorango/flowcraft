import type { ExecutionMetadata } from './types'

/**
 * Synchronous context implementation. Provides type-safe access to workflow state.
 * Serialization for complex types is handled by a pluggable serializer in the Runtime.
 */
export class Context<TContext extends Record<string, any> = Record<string, any>> {
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
	get<K extends keyof TContext>(key: K): TContext[K] | undefined {
		return this.data.get(String(key)) as TContext[K] | undefined
	}

	/**
	 * Set a value in the context with full type safety
	 */
	set<K extends keyof TContext>(key: K, value: TContext[K]): void {
		this.data.set(String(key), value)
	}

	/**
	 * Check if a key exists in the context
	 */
	has(key: keyof TContext): boolean {
		return this.data.has(String(key))
	}

	/**
	 * Delete a key from the context
	 */
	delete(key: keyof TContext): boolean {
		return this.data.delete(String(key))
	}

	/**
	 * Get all context keys
	 */
	keys(): string[] {
		return Array.from(this.data.keys())
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
	toJSON(): Record<string, any> {
		return Object.fromEntries(this.data)
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
	createScope(additionalData: Record<string, any> = {}): Context<TContext> {
		const currentData = Object.fromEntries(this.data)
		const mergedData = { ...currentData, ...additionalData }
		return new Context<TContext>(mergedData as Partial<TContext>, this.metadata)
	}

	/**
	 * Merges data from another context into this one, overwriting existing keys.
	 */
	merge(other: Context<any>): void {
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

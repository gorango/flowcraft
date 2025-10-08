import type { ExecutionMetadata } from './types.js'

/**
 * Synchronous context implementation for Flowcraft V2
 * Provides type-safe access to workflow state with serialization support
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
	 * Convert context to a plain object for serialization
	 */
	toJSON(): Record<string, any> {
		const obj: Record<string, any> = {}
		for (const [key, value] of this.data.entries()) {
			obj[String(key)] = this.serializeValue(value)
		}
		return obj
	}

	/**
	 * Create a context from a plain object
	 */
	static fromJSON<TContext extends Record<string, any>>(
		data: Record<string, any>,
		metadata: ExecutionMetadata,
	): Context<TContext> {
		const obj: Record<string, any> = {}
		for (const [key, value] of Object.entries(data)) {
			obj[key] = this.deserializeValue(value)
		}
		return new Context<TContext>(obj as any, metadata)
	}

	/**
	 * Create a new context with updated metadata
	 */
	withMetadata(metadata: Partial<ExecutionMetadata>): Context<TContext> {
		return new Context<TContext>(this.toJSON() as Partial<TContext>, { ...this.metadata, ...metadata })
	}

	/**
	 * Create a scoped context for sub-workflows
	 */
	createScope(additionalData: Record<string, any> = {}): Context<TContext> {
		const currentData = this.toJSON()
		const mergedData = { ...currentData, ...additionalData }
		return new Context<TContext>(mergedData as Partial<TContext>, this.metadata)
	}

	/**
	 * Get execution metadata
	 */
	getMetadata(): ExecutionMetadata {
		return this.metadata
	}

	/**
	 * Serialize a value for JSON storage
	 * This is a basic implementation - can be enhanced with superjson later
	 */
	private serializeValue(value: any): any {
		if (value === null || value === undefined) {
			return value
		}

		if (typeof value === 'object') {
			// Handle Date objects
			if (value instanceof Date) {
				return { __type: 'Date', value: value.toISOString() }
			}

			// Handle Map objects
			if (value instanceof Map) {
				return { __type: 'Map', value: Array.from(value.entries()) }
			}

			// Handle Set objects
			if (value instanceof Set) {
				return { __type: 'Set', value: Array.from(value) }
			}

			// Handle RegExp objects
			if (value instanceof RegExp) {
				return { __type: 'RegExp', value: { source: value.source, flags: value.flags } }
			}

			// Handle Error objects
			if (value instanceof Error) {
				return { __type: 'Error', value: { message: value.message, stack: value.stack } }
			}
		}

		return value
	}

	/**
	 * Deserialize a value from JSON storage
	 */
	private static deserializeValue(value: any): any {
		if (value === null || value === undefined) {
			return value
		}

		if (typeof value === 'object' && value.__type) {
			switch (value.__type) {
				case 'Date':
					return new Date(value.value)
				case 'Map':
					return new Map(value.value)
				case 'Set':
					return new Set(value.value)
				case 'RegExp':
					return new RegExp(value.value.source, value.value.flags)
				case 'Error': {
					const error = new Error(value.value.message)
					error.stack = value.value.stack
					return error
				}
			}
		}

		return value
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

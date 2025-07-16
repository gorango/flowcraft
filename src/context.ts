/**
 * Defines the interface for the shared context object passed through the workflow.
 */
export interface Context {
	get: <T>(key: any) => T | undefined
	set: <T>(key: any, value: T) => this
	has: (key: any) => boolean
}

/**
 * A type-safe, Map-based implementation of the Context.
 */
export class TypedContext implements Context {
	private data: Map<any, any>

	constructor(initialData?: Iterable<readonly [any, any]> | null) {
		this.data = new Map<any, any>(initialData)
	}

	get<T>(key: any): T | undefined {
		return this.data.get(key)
	}

	set<T>(key: any, value: T): this {
		this.data.set(key, value)
		return this
	}

	has(key: any): boolean {
		return this.data.has(key)
	}
}

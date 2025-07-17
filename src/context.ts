/**
 * A type-safe, opaque key for storing and retrieving values from the Context.
 * @template T The type of the value this key refers to.
 */
export type ContextKey<T> = symbol & { __type: T }

/**
 * Creates a new, unique ContextKey for type-safe access.
 * @param description An optional description for debugging purposes.
 */
export const contextKey = <T>(description?: string): ContextKey<T> => Symbol(description) as ContextKey<T>

/**
 * Defines the interface for the shared context object passed through the workflow.
 * It supports both type-safe `ContextKey`s and flexible `string` keys.
 */
export interface Context {
	get: (<T>(key: ContextKey<T>) => T | undefined) & (<T = any>(key: string) => T | undefined)
	set: (<T>(key: ContextKey<T>, value: T) => this) & ((key: string, value: any) => this)
	has: ((key: ContextKey<any>) => boolean) & ((key: string) => boolean)
	entries: () => IterableIterator<[any, any]>
}

/**
 * A Map-based implementation of the Context that supports both key types.
 */
export class TypedContext implements Context {
	private data: Map<any, any>

	constructor(initialData?: Iterable<readonly [ContextKey<any> | string, any]> | null) {
		this.data = new Map<any, any>(initialData)
	}

	get(key: ContextKey<any> | string): any {
		return this.data.get(key)
	}

	set(key: ContextKey<any> | string, value: any): this {
		this.data.set(key, value)
		return this
	}

	has(key: ContextKey<any> | string): boolean {
		return this.data.has(key)
	}

	entries(): IterableIterator<[any, any]> {
		return this.data.entries()
	}
}

export type ContextTransform = (ctx: Context) => Context

export interface ContextLens<T> {
	get: (ctx: Context) => T | undefined
	set: (value: T) => ContextTransform
	update: (fn: (current: T | undefined) => T) => ContextTransform
}

export function lens<T>(key: ContextKey<T>): ContextLens<T> {
	return {
		get: (ctx: Context) => ctx.get(key),
		set: (value: T) => (ctx: Context) => ctx.set(key, value),
		update: (fn: (current: T | undefined) => T) => (ctx: Context) =>
			ctx.set(key, fn(ctx.get(key))),
	}
}

export function composeContext(...transforms: ContextTransform[]): ContextTransform {
	return (ctx: Context) => transforms.reduce((acc, transform) => transform(acc), ctx)
}

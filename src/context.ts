/**
 * A type-safe, opaque key for storing and retrieving values from the Context.
 * Using a `ContextKey` provides compile-time safety for your workflow's state.
 * @template T The type of the value this key refers to.
 */
export type ContextKey<T> = symbol & { __type: T }

/**
 * Creates a new, unique `ContextKey` for type-safe access to the `Context`.
 * @template T The type of the value this key will hold.
 * @param description An optional description for debugging purposes (e.g., in logs or test snapshots).
 * @returns A unique `ContextKey<T>`.
 */
export const contextKey = <T>(description?: string): ContextKey<T> => Symbol(description) as ContextKey<T>

/**
 * Defines the interface for the shared context object passed through the workflow.
 * It acts as the shared memory for all nodes in a flow. It supports both
 * type-safe `ContextKey`s and flexible `string` keys.
 */
export interface Context {
	/** Retrieves a value from the context. */
	get: (<T>(key: ContextKey<T>) => T | undefined) & (<T = any>(key: string) => T | undefined)
	/** Stores a value in the context. */
	set: (<T>(key: ContextKey<T>, value: T) => this) & ((key: string, value: any) => this)
	/** Checks if a key exists in the context. */
	has: ((key: ContextKey<any>) => boolean) & ((key: string) => boolean)
	/** Returns an iterator of all [key, value] pairs in the context. */
	entries: () => IterableIterator<[any, any]>
}

/**
 * The default, `Map`-based implementation of the `Context` interface.
 */
export class TypedContext implements Context {
	private data: Map<any, any>

	/**
	 * @param initialData An optional iterable (like an array of `[key, value]` pairs)
	 * to initialize the context with.
	 */
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

/** A function that takes a `Context` and returns a (potentially new) `Context`. */
export type ContextTransform = (ctx: Context) => Context

/**
 * A "lens" provides a way to "focus" on a single key in the `Context`,
 * creating reusable, type-safe functions to get, set, or update its value.
 * @template T The type of the value the lens focuses on.
 */
export interface ContextLens<T> {
	/** Retrieves the value for the key from the context. */
	get: (ctx: Context) => T | undefined
	/** Returns a `ContextTransform` function that will set the key to the provided value. */
	set: (value: T) => ContextTransform
	/** Returns a `ContextTransform` function that updates the key's value based on its current value. */
	update: (fn: (current: T | undefined) => T) => ContextTransform
}

/**
 * Creates a `ContextLens` object for a specific `ContextKey`.
 * This is the entry point for functional context manipulation.
 *
 * @example
 * const NAME = contextKey<string>('name')
 * const nameLens = lens(NAME)
 * const setNameTransform = nameLens.set('Alice') // This is a function: (ctx) => ctx.set(NAME, 'Alice')
 *
 * @param key The `ContextKey` to focus on.
 * @returns A `ContextLens<T>` object with `.get()`, `.set()`, and `.update()` methods.
 */
export function lens<T>(key: ContextKey<T>): ContextLens<T> {
	return {
		get: (ctx: Context) => ctx.get(key),
		set: (value: T) => (ctx: Context) => ctx.set(key, value),
		update: (fn: (current: T | undefined) => T) => (ctx: Context) =>
			ctx.set(key, fn(ctx.get(key))),
	}
}

/**
 * Composes multiple `ContextTransform` functions into a single `ContextTransform` function.
 * The transformations are applied in the order they are provided.
 *
 * @param transforms A sequence of `ContextTransform` functions.
 * @returns A single function that applies all transformations.
 */
export function composeContext(...transforms: ContextTransform[]): ContextTransform {
	return (ctx: Context) => transforms.reduce((acc, transform) => transform(acc), ctx)
}

/* eslint-disable style/lines-between-class-members, style/max-statements-per-line */

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
 * This interface is "async-aware", allowing for both synchronous (Map-based)
 * and asynchronous (e.g., Redis-backed) implementations.
 */
export interface Context {
	/**
	 * Asynchronously retrieves a value from the context.
	 * Callers should ALWAYS `await` the result of this method.
	 */
	get: (<T>(key: ContextKey<T>) => Promise<T | undefined>)
		& (<T = any>(key: string) => Promise<T | undefined>)
	/** Asynchronously stores a value in the context. */
	set: (<T>(key: ContextKey<T>, value: T) => Promise<this>)
		& ((key: string, value: any) => Promise<this>)
	/** Asynchronously checks if a key exists in the context. */
	has: ((key: ContextKey<any>) => Promise<boolean>)
		& ((key: string) => Promise<boolean>)
	/** Asynchronously deletes a key from the context. */
	delete: ((key: ContextKey<any>) => Promise<boolean>)
		& ((key: string) => Promise<boolean>)
	/**
	 * Returns an iterator of all [key, value] pairs in the context.
	 * NOTE: This may not be supported or may be inefficient in some async implementations.
	 */
	entries: () => IterableIterator<[any, any]>
	/**
	 * Returns an iterator of all keys in the context.
	 * NOTE: This may not be supported or may be inefficient in some async implementations.
	 */
	keys: () => IterableIterator<any>
	/**
	 * Returns an iterator of all values in the context.
	 * NOTE: This may not be supported or may be inefficient in some async implementations.
	 */
	values: () => IterableIterator<any>
}

/**
 * The default, `Map`-based implementation of the `Context` interface.
 * Its methods are async to satisfy the `Context` interface, but they wrap
 * synchronous operations.
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
	async get(key: ContextKey<any> | string): Promise<any> { return this.data.get(key) }
	async set(key: ContextKey<any> | string, value: any): Promise<this> { this.data.set(key, value); return this }
	async has(key: ContextKey<any> | string): Promise<boolean> { return this.data.has(key) }
	async delete(key: ContextKey<any> | string): Promise<boolean> { return this.data.delete(key) }
	entries(): IterableIterator<[any, any]> { return this.data.entries() }
	keys(): IterableIterator<any> { return this.data.keys() }
	values(): IterableIterator<any> { return this.data.values() }
}

/** A function that takes a `Context` and returns a (potentially new) `Context`. */
export type ContextTransform = (ctx: Context) => Context | Promise<Context>

/**
 * A "lens" provides a way to "focus" on a single key in the `Context`,
 * creating reusable, type-safe async functions to get, set, or update its value.
 * @template T The type of the value the lens focuses on.
 */
export interface ContextLens<T> {
	/** Asynchronously retrieves the value for the key from the context. */
	get: (ctx: Context) => Promise<T | undefined>
	/** Returns an asynchronous `ContextTransform` function that will set the key to the provided value. */
	set: (value: T) => ContextTransform
	/** Returns an asynchronous `ContextTransform` function that updates the key's value based on its current value. */
	update: (fn: (current: T | undefined) => T) => ContextTransform
}

/**
 * Creates a `ContextLens` object for a specific `ContextKey`.
 * This is the entry point for functional context manipulation.
 * All operations that read from the context are now async.
 *
 * @example
 * const NAME = contextKey<string>('name')
 * const nameLens = lens(NAME)
 *
 * // Usage in an async function:
 * async function exampleUsage(ctx: Context) {
 *   const currentName = await nameLens.get(ctx);
 *   const setNameTransform = nameLens.set('Alice');
 *   await setNameTransform(ctx);
 * }
 *
 * @param key The `ContextKey` to focus on.
 * @returns A `ContextLens<T>` object with async-aware methods.
 */
export function lens<T>(key: ContextKey<T>): ContextLens<T> {
	return {
		get: async (ctx: Context): Promise<T | undefined> => {
			return await ctx.get(key) as T | undefined
		},
		set: (value: T): ContextTransform => async (ctx: Context) => {
			return await ctx.set(key, value)
		},
		update: (fn: (current: T | undefined) => T): ContextTransform => async (ctx: Context) => {
			const currentValue = await ctx.get(key) as T | undefined
			const newValue = fn(currentValue)
			return await ctx.set(key, newValue)
		},
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
	return async (ctx: Context) => {
		let currentContext = ctx
		for (const transform of transforms) {
			currentContext = await transform(currentContext)
		}
		return currentContext
	}
}

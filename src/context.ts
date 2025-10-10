import type { IAsyncContext, ISyncContext } from './types'

/**
 * A default, high-performance, in-memory implementation of ISyncContext using a Map.
 */
export class Context<TContext extends Record<string, any>> implements ISyncContext<TContext> {
	public readonly type = 'sync' as const
	private data: Map<string, any>

	constructor(initialData: Partial<TContext> = {}) {
		this.data = new Map(Object.entries(initialData))
	}

	get<K extends keyof TContext>(key: K): TContext[K] | undefined {
		return this.data.get(String(key))
	}

	set<K extends keyof TContext>(key: K, value: TContext[K]): void {
		this.data.set(String(key), value)
	}

	has(key: keyof TContext): boolean {
		return this.data.has(String(key))
	}

	delete(key: keyof TContext): boolean {
		return this.data.delete(String(key))
	}

	toJSON(): Record<string, any> {
		return Object.fromEntries(this.data)
	}
}

/**
 * An adapter that provides a consistent, Promise-based view of a synchronous context.
 * This is created by the runtime and is transparent to the node author.
 */
export class AsyncContextView<TContext extends Record<string, any>> implements IAsyncContext<TContext> {
	public readonly type = 'async' as const

	constructor(private syncContext: ISyncContext<TContext>) { }

	get<K extends keyof TContext>(key: K): Promise<TContext[K] | undefined> {
		return Promise.resolve(this.syncContext.get(key))
	}

	set<K extends keyof TContext>(key: K, value: TContext[K]): Promise<void> {
		this.syncContext.set(key, value)
		return Promise.resolve()
	}

	has(key: keyof TContext): Promise<boolean> {
		return Promise.resolve(this.syncContext.has(key))
	}

	delete(key: keyof TContext): Promise<boolean> {
		return Promise.resolve(this.syncContext.delete(key))
	}

	toJSON(): Promise<Record<string, any>> {
		return Promise.resolve(this.syncContext.toJSON())
	}
}

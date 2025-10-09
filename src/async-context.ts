import type { IAsyncContext, ExecutionMetadata } from './types'
import { Context } from './context'

/**
 * A simple in-memory implementation of IAsyncContext for testing and development.
 * It simulates asynchronicity by wrapping a synchronous Context with Promises.
 */
export class AsyncContext<TContext extends Record<string, any> = Record<string, any>> implements IAsyncContext<TContext> {
	public readonly type = 'async' as const
	private syncContext: Context<TContext>

	constructor(initialData: Partial<TContext> = {}, metadata: ExecutionMetadata) {
		this.syncContext = new Context(initialData, metadata)
	}

	async get<K extends keyof TContext>(key: K): Promise<TContext[K] | undefined> {
		return Promise.resolve(this.syncContext.get(key))
	}

	async set<K extends keyof TContext>(key: K, value: TContext[K]): Promise<void> {
		this.syncContext.set(key, value)
		return Promise.resolve()
	}

	async has(key: keyof TContext): Promise<boolean> {
		return Promise.resolve(this.syncContext.has(key))
	}

	async delete(key: keyof TContext): Promise<boolean> {
		return this.syncContext.delete(key)
	}

	async keys(): Promise<string[]> {
		return Promise.resolve(this.syncContext.keys())
	}

	async toJSON(): Promise<Record<string, any>> {
		return Promise.resolve(this.syncContext.toJSON())
	}

	getMetadata(): ExecutionMetadata {
		return this.syncContext.getMetadata()
	}

	setMetadata(metadata: Partial<ExecutionMetadata>): this {
		this.syncContext.setMetadata(metadata)
		return this
	}

	createScope(additionalData: Record<string, any> = {}): IAsyncContext<TContext> {
		const currentData = this.syncContext.toJSON()
		const mergedData = { ...currentData, ...additionalData }
		return new AsyncContext<TContext>(mergedData as unknown as Partial<TContext>, this.syncContext.getMetadata())
	}

	async merge(other: IAsyncContext<any>): Promise<void> {
		const otherData = await other.toJSON()
		this.syncContext.merge(Context.fromJSON(otherData, this.syncContext.getMetadata()))
	}
}

/**
 * Factory function for creating async contexts
 */
export function createAsyncContext<TContext extends Record<string, any> = Record<string, any>>(
	initialData: Partial<TContext> = {},
	metadata: ExecutionMetadata,
): IAsyncContext<TContext> {
	return new AsyncContext(initialData, metadata)
}
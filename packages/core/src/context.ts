import type { IAsyncContext, ISyncContext, PatchOperation } from './types'

/**
 * A default, high-performance, in-memory implementation of ISyncContext using a Map.
 */
export class Context<TContext extends Record<string, any>> implements ISyncContext<TContext> {
	public readonly type = 'sync' as const
	private data: Map<string, any>

	constructor(initialData: Partial<TContext> = {}) {
		this.data = new Map(Object.entries(initialData))
	}

	get<K extends keyof TContext>(key: K): TContext[K] | undefined
	get(key: string): any | undefined {
		return this.data.get(key)
	}

	set<K extends keyof TContext>(key: K, value: TContext[K]): void
	set(key: string, value: any): void {
		this.data.set(key, value)
	}

	has<K extends keyof TContext>(key: K): boolean
	has(key: string): boolean {
		return this.data.has(key)
	}

	delete<K extends keyof TContext>(key: K): boolean
	delete(key: string): boolean {
		return this.data.delete(key)
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

	constructor(private syncContext: ISyncContext<TContext>) {}

	get<K extends keyof TContext>(key: K): Promise<TContext[K] | undefined>
	get(key: string): Promise<any | undefined> {
		return Promise.resolve(this.syncContext.get(key))
	}

	set<K extends keyof TContext>(key: K, value: TContext[K]): Promise<void>
	set(key: string, value: any): Promise<void> {
		this.syncContext.set(key, value)
		return Promise.resolve()
	}

	has<K extends keyof TContext>(key: K): Promise<boolean>
	has(key: string): Promise<boolean> {
		return Promise.resolve(this.syncContext.has(key))
	}

	delete<K extends keyof TContext>(key: K): Promise<boolean>
	delete(key: string): Promise<boolean> {
		return Promise.resolve(this.syncContext.delete(key))
	}

	toJSON(): Promise<Record<string, any>> {
		return Promise.resolve(this.syncContext.toJSON())
	}

	async patch(_operations: PatchOperation[]): Promise<void> {
		throw new Error('Patch operations not supported by AsyncContextView')
	}
}

/**
 * A proxy wrapper that tracks changes to an async context for delta-based persistence.
 * Records all mutations (set/delete operations) to enable efficient partial updates.
 */
export class TrackedAsyncContext<TContext extends Record<string, any>> implements IAsyncContext<TContext> {
	public readonly type = 'async' as const
	private deltas: PatchOperation[] = []
	private innerContext: IAsyncContext<TContext>
	private eventBus?: any
	private executionId?: string
	private sourceNode?: string

	constructor(innerContext: IAsyncContext<TContext>, eventBus?: any, executionId?: string, sourceNode?: string) {
		this.innerContext = innerContext
		this.eventBus = eventBus
		this.executionId = executionId
		this.sourceNode = sourceNode
	}

	async get<K extends keyof TContext>(key: K): Promise<TContext[K] | undefined>
	async get(key: string): Promise<any | undefined> {
		return this.innerContext.get(key)
	}

	async set<K extends keyof TContext>(key: K, value: TContext[K]): Promise<void>
	async set(key: string, value: any): Promise<void> {
		this.deltas.push({ op: 'set', key, value })
		await this.innerContext.set(key, value)
		if (this.eventBus && this.executionId) {
			await this.eventBus.emit({
				type: 'context:change',
				payload: {
					sourceNode: this.sourceNode || 'unknown',
					key,
					op: 'set',
					value,
					executionId: this.executionId,
				},
			})
		}
	}

	async has<K extends keyof TContext>(key: K): Promise<boolean>
	async has(key: string): Promise<boolean> {
		return this.innerContext.has(key)
	}

	async delete<K extends keyof TContext>(key: K): Promise<boolean>
	async delete(key: string): Promise<boolean> {
		this.deltas.push({ op: 'delete', key })
		const result = await this.innerContext.delete(key)
		if (this.eventBus && this.executionId && result) {
			await this.eventBus.emit({
				type: 'context:change',
				payload: {
					sourceNode: this.sourceNode || 'unknown',
					key,
					op: 'delete',
					executionId: this.executionId,
				},
			})
		}
		return result
	}

	toJSON(): Promise<Record<string, any>> {
		return this.innerContext.toJSON()
	}

	async patch(operations: PatchOperation[]): Promise<void> {
		if (this.innerContext.patch) {
			return this.innerContext.patch(operations)
		}

		for (const op of operations) {
			if (op.op === 'set') {
				await this.innerContext.set(op.key, op.value)
			} else if (op.op === 'delete') {
				await this.innerContext.delete(op.key)
			}
		}
	}

	getDeltas(): PatchOperation[] {
		return [...this.deltas]
	}

	clearDeltas(): void {
		this.deltas = []
	}

	/**
	 * Configures the event emitter for tracking context changes.
	 * This enables the context to emit events when set/delete operations occur,
	 * allowing for external monitoring and persistence of context mutations.
	 *
	 * @param eventBus - The event bus instance to emit context change events
	 * @param executionId - The unique identifier for the current workflow execution
	 * @param sourceNode - Optional identifier for the node that triggered the context change
	 */
	configureEventEmitter(eventBus: any, executionId: string, sourceNode?: string): void {
		this.eventBus = eventBus
		this.executionId = executionId
		this.sourceNode = sourceNode
	}
}

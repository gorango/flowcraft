import type { IAsyncContext, PatchOperation } from 'flowcraft'

export interface DurableObjectStorage {
	get<T = unknown>(key: string): Promise<T | undefined>
	put(key: string, value: unknown, options?: { onlyIf?: { equals?: unknown } }): Promise<void>
	delete(key: string): Promise<boolean>
	list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>
}

export interface DurableObjectContextOptions {
	storage: DurableObjectStorage
	runId: string
}

export class DurableObjectContext implements IAsyncContext<Record<string, any>> {
	public readonly type = 'async' as const
	private readonly storage: DurableObjectStorage
	private readonly runId: string

	constructor(runId: string, options: DurableObjectContextOptions) {
		this.runId = runId
		this.storage = options.storage
	}

	private getKey(key: string): string {
		return `${this.runId}:${key}`
	}

	async get<K extends string>(key: K): Promise<any | undefined> {
		const value = await this.storage.get(this.getKey(key))
		return value
	}

	async set<K extends string>(key: K, value: any): Promise<void> {
		await this.storage.put(this.getKey(key), value)
	}

	async has<K extends string>(key: K): Promise<boolean> {
		const value = await this.storage.get(this.getKey(key))
		return value !== undefined
	}

	async delete<K extends string>(key: K): Promise<boolean> {
		return this.storage.delete(this.getKey(key))
	}

	async toJSON(): Promise<Record<string, any>> {
		const prefix = `${this.runId}:`
		const entries = await this.storage.list({ prefix })
		const result: Record<string, any> = {}

		for (const [key, value] of entries) {
			if (key.startsWith(prefix)) {
				const shortKey = key.substring(prefix.length)
				result[shortKey] = value
			}
		}

		return result
	}

	async patch(operations: PatchOperation[]): Promise<void> {
		if (operations.length === 0) return

		for (const op of operations) {
			if (op.op === 'set') {
				await this.storage.put(this.getKey(op.key), op.value)
			} else if (op.op === 'delete') {
				await this.storage.delete(this.getKey(op.key))
			}
		}
	}
}

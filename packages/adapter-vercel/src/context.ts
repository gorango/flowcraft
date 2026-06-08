import type { IAsyncContext, PatchOperation } from 'flowcraft'
import type { Redis } from 'ioredis'

export interface VercelKvContextOptions {
	client: Redis
	keyPrefix?: string
	ttlSeconds?: number
}

export class VercelKvContext implements IAsyncContext<Record<string, any>> {
	public readonly type = 'async' as const
	private readonly client: Redis
	private readonly runId: string
	private readonly keyPrefix: string
	private readonly ttlSeconds: number

	constructor(runId: string, options: VercelKvContextOptions) {
		this.runId = runId
		this.client = options.client
		this.keyPrefix = options.keyPrefix ?? 'flowcraft:context:'
		this.ttlSeconds = options.ttlSeconds ?? 86400
	}

	private getKey(key: string): string {
		return `${this.keyPrefix}${this.runId}:${key}`
	}

	async get<K extends string>(key: K): Promise<any | undefined> {
		const value = await this.client.get(this.getKey(key))
		if (value === null) return undefined
		try {
			return JSON.parse(value)
		} catch {
			return value
		}
	}

	async set<K extends string>(key: K, value: any): Promise<void> {
		const serialized = typeof value === 'string' ? value : JSON.stringify(value)
		await this.client.set(this.getKey(key), serialized, 'EX', this.ttlSeconds)
	}

	async has<K extends string>(key: K): Promise<boolean> {
		const exists = await this.client.exists(this.getKey(key))
		return exists === 1
	}

	async delete<K extends string>(key: K): Promise<boolean> {
		const result = await this.client.del(this.getKey(key))
		return result === 1
	}

	async toJSON(): Promise<Record<string, any>> {
		const prefix = `${this.keyPrefix}${this.runId}:`
		const keys = await this.client.keys(`${prefix}*`)
		const result: Record<string, any> = {}

		for (const fullKey of keys) {
			const shortKey = fullKey.substring(prefix.length)
			const value = await this.client.get(fullKey)
			if (value !== null) {
				try {
					result[shortKey] = JSON.parse(value)
				} catch {
					result[shortKey] = value
				}
			}
		}

		return result
	}

	async patch(operations: PatchOperation[]): Promise<void> {
		if (operations.length === 0) return

		const pipeline = this.client.pipeline()
		for (const op of operations) {
			if (op.op === 'set') {
				const serialized = typeof op.value === 'string' ? op.value : JSON.stringify(op.value)
				pipeline.set(this.getKey(op.key), serialized, 'EX', this.ttlSeconds)
			} else if (op.op === 'delete') {
				pipeline.del(this.getKey(op.key))
			}
		}
		await pipeline.exec()
	}
}

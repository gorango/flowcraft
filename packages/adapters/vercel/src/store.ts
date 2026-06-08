import type { ICoordinationStore } from 'flowcraft'
import type { Redis } from 'ioredis'

export interface VercelKvCoordinationStoreOptions {
	client: Redis
	keyPrefix?: string
}

export class VercelKvCoordinationStore implements ICoordinationStore {
	private readonly client: Redis
	private readonly keyPrefix: string

	constructor(options: VercelKvCoordinationStoreOptions) {
		this.client = options.client
		this.keyPrefix = options.keyPrefix ?? 'flowcraft:coord:'
	}

	private getKey(key: string): string {
		return `${this.keyPrefix}${key}`
	}

	async increment(key: string, ttlSeconds: number): Promise<number> {
		const fullKey = this.getKey(key)
		const newValue = await this.client.incr(fullKey)
		await this.client.expire(fullKey, ttlSeconds)
		return newValue
	}

	async setIfNotExist(key: string, value: string, ttlSeconds: number): Promise<boolean> {
		const fullKey = this.getKey(key)
		const result = await this.client.set(fullKey, value, 'EX', ttlSeconds, 'NX')
		return result === 'OK'
	}

	async delete(key: string): Promise<void> {
		await this.client.del(this.getKey(key))
	}

	async extendTTL(key: string, ttlSeconds: number): Promise<boolean> {
		const fullKey = this.getKey(key)
		const exists = await this.client.exists(fullKey)
		if (exists === 0) return false
		await this.client.expire(fullKey, ttlSeconds)
		return true
	}

	async get(key: string): Promise<string | undefined> {
		const value = await this.client.get(this.getKey(key))
		return value ?? undefined
	}
}

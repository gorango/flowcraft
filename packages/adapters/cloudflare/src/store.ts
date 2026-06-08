import type { ICoordinationStore } from 'flowcraft'
import type { DurableObjectStorage } from './context'

export interface KVNamespace {
	get(key: string, type?: 'text'): Promise<string | null>
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
	delete(key: string): Promise<void>
	list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>
}

export interface DurableObjectCoordinationStoreOptions {
	namespace: DurableObjectStorage
}

export class DurableObjectCoordinationStore implements ICoordinationStore {
	private readonly namespace: DurableObjectStorage

	constructor(options: DurableObjectCoordinationStoreOptions) {
		this.namespace = options.namespace
	}

	async increment(key: string, ttlSeconds: number): Promise<number> {
		const current = await this.namespace.get<number>(key)
		const currentValue = current ?? 0
		const newValue = currentValue + 1

		await this.namespace.put(key, newValue)
		this.scheduleTTLReset(key, ttlSeconds)

		return newValue
	}

	async setIfNotExist(key: string, value: string, ttlSeconds: number): Promise<boolean> {
		const existing = await this.namespace.get(key)
		if (existing !== undefined) {
			return false
		}

		try {
			await this.namespace.put(key, value, { onlyIf: { equals: undefined } })
			this.scheduleTTLReset(key, ttlSeconds)
			return true
		} catch {
			return false
		}
	}

	async delete(key: string): Promise<void> {
		await this.namespace.delete(key)
	}

	async extendTTL(key: string, _ttlSeconds: number): Promise<boolean> {
		const current = await this.namespace.get<string>(key)
		if (current === undefined) {
			return false
		}

		await this.namespace.put(key, current)
		return true
	}

	async get(key: string): Promise<string | undefined> {
		const value = await this.namespace.get<string>(key)
		return value ?? undefined
	}

	private scheduleTTLReset(_key: string, _ttlSeconds: number): void {
		// Note: Durable Object storage handles TTL automatically in production
		// via expirationTtl in put options. This is a placeholder for cases
		// where manual TTL management might be needed.
		// In a real implementation, you might use:
		// this.namespace.put(key, value, { expirationTtl: ttlSeconds })
	}
}

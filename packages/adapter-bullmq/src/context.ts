import type { IAsyncContext } from 'flowcraft'
import type IORedis from 'ioredis'

/**
 * A distributed context that persists state in a Redis hash.
 * Each workflow run gets its own hash key, allowing for concurrent executions.
 */
export class RedisContext implements IAsyncContext<Record<string, any>> {
	public readonly type = 'async' as const
	private stateKey: string

	constructor(
		private redis: IORedis,
		runId: string,
	) {
		this.stateKey = `workflow:state:${runId}`
	}

	async get(key: string): Promise<any> {
		const value = await this.redis.hget(this.stateKey, key)
		return value ? JSON.parse(value) : undefined
	}

	async set<K extends string>(key: K, value: any): Promise<void> {
		await this.redis.hset(this.stateKey, key, JSON.stringify(value))
	}

	async has(key: string): Promise<boolean> {
		return (await this.redis.hexists(this.stateKey, key)) === 1
	}

	async delete(key: string): Promise<boolean> {
		return (await this.redis.hdel(this.stateKey, key)) > 0
	}

	async toJSON(): Promise<Record<string, any>> {
		const data = await this.redis.hgetall(this.stateKey)
		const result: Record<string, any> = {}
		for (const [key, value] of Object.entries(data)) {
			result[key] = JSON.parse(value)
		}
		return result
	}
}

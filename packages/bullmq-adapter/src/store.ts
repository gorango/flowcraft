import type { ICoordinationStore } from 'flowcraft'
import type IORedis from 'ioredis'

export class RedisCoordinationStore implements ICoordinationStore {
	constructor(private redis: IORedis) { }

	async increment(key: string, ttlSeconds: number): Promise<number> {
		const pipeline = this.redis.pipeline()
		pipeline.incr(key)
		pipeline.expire(key, ttlSeconds)
		const results = await pipeline.exec()
		// The result of INCR is at index 0, value is at index 1 of the result tuple.
		return (results?.[0]?.[1] as number) ?? 0
	}

	async setIfNotExist(key: string, value: string, ttlSeconds: number): Promise<boolean> {
		const result = await this.redis.set(key, value, 'EX', ttlSeconds, 'NX')
		return result === 'OK'
	}

	async delete(key: string): Promise<void> {
		await this.redis.del(key)
	}
}

import type { ICoordinationStore } from 'flowcraft'
import type { Redis as RedisClient } from 'ioredis'

export class RedisCoordinationStore implements ICoordinationStore {
	constructor(private redis: RedisClient) {}

	async increment(key: string, ttlSeconds: number): Promise<number> {
		const pipeline = this.redis.pipeline()
		pipeline.incr(key)
		pipeline.expire(key, ttlSeconds)
		const results = await pipeline.exec()
		if (!results) return 0

		const [[, count]] = results
		return count as number
	}

	async setIfNotExist(key: string, value: string, ttlSeconds: number): Promise<boolean> {
		const result = await this.redis.set(key, value, 'EX', ttlSeconds, 'NX')
		return result === 'OK'
	}

	async delete(key: string): Promise<void> {
		await this.redis.del(key)
	}
}

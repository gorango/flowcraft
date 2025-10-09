// sandbox/6.distributed/src/BullMQContext.ts

import type IORedis from 'ioredis'
import type { ExecutionMetadata, IContext } from '../../../src/types.js'

/**
 * A distributed context that persists state in a Redis hash.
 * Each workflow run gets its own hash key, allowing for concurrent executions.
 */
export class BullMQContext implements IContext {
	private redis: IORedis
	private runId: string
	private stateKey: string
	private metadata: ExecutionMetadata

	constructor(redis: IORedis, runId: string, metadata: ExecutionMetadata) {
		this.redis = redis
		this.runId = runId
		this.stateKey = `workflow:state:${runId}`
		this.metadata = metadata
	}

	async get(key: string): Promise<any> {
		const value = await this.redis.hget(this.stateKey, key)
		return value ? JSON.parse(value) : undefined
	}

	async set(key: string, value: any): Promise<this> {
		await this.redis.hset(this.stateKey, key, JSON.stringify(value))
		return this
	}

	async has(key: string): Promise<boolean> {
		return (await this.redis.hexists(this.stateKey, key)) === 1
	}

	async delete(key: string): Promise<boolean> {
		return (await this.redis.hdel(this.stateKey, key)) > 0
	}

	async keys(): Promise<string[]> {
		return this.redis.hkeys(this.stateKey)
	}

	async toJSON(): Promise<Record<string, any>> {
		const data = await this.redis.hgetall(this.stateKey)
		const result: Record<string, any> = {}
		for (const [key, value] of Object.entries(data)) {
			result[key] = JSON.parse(value)
		}
		return result
	}

	// Metadata methods are synchronous as metadata is per-node-execution
	getMetadata(): ExecutionMetadata {
		return this.metadata
	}

	setMetadata(metadata: Partial<ExecutionMetadata>): this {
		this.metadata = { ...this.metadata, ...metadata }
		return this
	}

	// These methods are not applicable in a stateless distributed context
	createScope(): IContext {
		throw new Error('createScope is not supported in BullMQContext')
	}

	async merge(): Promise<void> {
		throw new Error('merge is not supported in BullMQContext')
	}
}

import type { Container, CosmosClient } from '@azure/cosmos'
import type { IAsyncContext, PatchOperation } from 'flowcraft'

export interface CosmosDbContextOptions {
	client: CosmosClient
	databaseName: string
	containerName: string
}

/**
 * A distributed context that persists state in an Azure Cosmos DB container.
 * Each workflow run gets its own item, identified by the runId.
 */
export class CosmosDbContext implements IAsyncContext<Record<string, any>> {
	public readonly type = 'async' as const
	private readonly container: Container
	private readonly runId: string

	constructor(runId: string, options: CosmosDbContextOptions) {
		this.runId = runId
		this.container = options.client.database(options.databaseName).container(options.containerName)
	}

	private async readItem(): Promise<Record<string, any> | null> {
		try {
			const { resource } = await this.container.item(this.runId, this.runId).read()
			return resource || null
		} catch (error: any) {
			if (error.code === 404) {
				return null // item not found is not an error
			}
			throw error
		}
	}

	async get<K extends string>(key: K): Promise<any> {
		const item = await this.readItem()
		return item?.[key]
	}

	async set<K extends string>(key: K, value: any): Promise<void> {
		// Use upsert for atomic create-or-replace operation
		const updatedItem = {
			id: this.runId,
			runId: this.runId,
			[key]: value,
		}
		await this.container.items.upsert(updatedItem)
	}

	async has<K extends string>(key: K): Promise<boolean> {
		const item = await this.readItem()
		return !!item && Object.hasOwn(item, key)
	}

	async delete<K extends string>(key: K): Promise<boolean> {
		try {
			await this.container.item(this.runId, this.runId).patch([{ op: 'remove', path: `/${key}` }])
			return true
		} catch (error: any) {
			// patch will fail if the path doesn't exist, which is a valid outcome for delete
			if (error.code === 400) {
				return false
			}
			throw error
		}
	}

	async toJSON(): Promise<Record<string, any>> {
		const item = await this.readItem()
		if (item) {
			const { id: _id, runId: _runId, _rid, _self, _etag, _attachments, _ts, ...contextData } = item
			return contextData
		}
		return {}
	}

	async patch(operations: PatchOperation[]): Promise<void> {
		if (operations.length === 0) return

		const patchOps = operations.map((op) => {
			if (op.op === 'set') {
				return {
					op: 'set' as const,
					path: `/${op.key}`,
					value: op.value,
				}
			} else {
				// Must be 'delete' since PatchOperation only has 'set' | 'delete'
				return {
					op: 'remove' as const,
					path: `/${op.key}`,
				}
			}
		})

		await this.container.item(this.runId, this.runId).patch(patchOps)
	}
}

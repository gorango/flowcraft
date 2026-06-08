import type {
	BlueprintResolveParams,
	BlueprintResolveResult,
	BlueprintResolver,
	BlueprintDatabase,
} from '../types'

export class DatabaseResolver implements BlueprintResolver {
	private db: BlueprintDatabase

	constructor(db: BlueprintDatabase) {
		this.db = db
	}

	async resolve(params: BlueprintResolveParams): Promise<BlueprintResolveResult> {
		if (!params.id) {
			throw new Error('Blueprint id is required for DatabaseResolver')
		}

		return this.db.find({ id: params.id, version: params.version })
	}

	async list(params?: { limit?: number; offset?: number }) {
		return this.db.list(params)
	}
}

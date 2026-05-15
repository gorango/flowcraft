import type { BlueprintResolveParams, BlueprintResolveResult, BlueprintResolver } from '../types'

export class CompositeResolver implements BlueprintResolver {
	private resolvers: BlueprintResolver[]

	constructor(resolvers: BlueprintResolver[]) {
		this.resolvers = resolvers
	}

	async resolve(params: BlueprintResolveParams): Promise<BlueprintResolveResult> {
		const errors: Error[] = []

		for (const resolver of this.resolvers) {
			try {
				return await resolver.resolve(params)
			} catch (error) {
				errors.push(error instanceof Error ? error : new Error(String(error)))
			}
		}

		const id = params.id ?? params.name ?? 'unknown'
		throw new Error(
			`Blueprint not found: ${id}. Tried ${this.resolvers.length} resolver(s): ${errors.map((e) => e.message).join('; ')}`,
		)
	}
}

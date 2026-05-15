import type { WorkflowBlueprint } from 'flowcraft'
import type { BlueprintResolveParams, BlueprintResolveResult, BlueprintResolver } from '../types'

export class DirectResolver implements BlueprintResolver {
	private blueprints: Map<string, WorkflowBlueprint[]>

	constructor(
		blueprints:
			| Map<string, WorkflowBlueprint[]>
			| Record<string, WorkflowBlueprint | WorkflowBlueprint[]>,
	) {
		if (blueprints instanceof Map) {
			this.blueprints = blueprints
		} else {
			this.blueprints = new Map()
			for (const [id, value] of Object.entries(blueprints)) {
				this.blueprints.set(id, Array.isArray(value) ? value : [value])
			}
		}
	}

	async resolve(params: BlueprintResolveParams): Promise<BlueprintResolveResult> {
		if (!params.id) {
			throw new Error('Blueprint id is required for DirectResolver')
		}

		const versions = this.blueprints.get(params.id)
		if (!versions || versions.length === 0) {
			throw new Error(`Blueprint not found: ${params.id}`)
		}

		let blueprint: WorkflowBlueprint
		let version: string

		if (params.version) {
			const found = versions.find((bp) => bp.metadata?.version === params.version)
			if (!found) {
				throw new Error(`Blueprint version not found: ${params.id}@${params.version}`)
			}
			blueprint = found
			version = params.version
		} else {
			blueprint = versions[versions.length - 1]
			version = blueprint.metadata?.version ?? 'latest'
		}

		return { blueprint, version }
	}
}

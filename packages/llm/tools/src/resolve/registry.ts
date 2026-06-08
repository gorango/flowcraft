import type { WorkflowBlueprint } from 'flowcraft'
import type {
	BlueprintResolveParams,
	BlueprintResolveResult,
	BlueprintResolver,
	FlowcraftRuntime,
} from '../types'

export class RegistryResolver implements BlueprintResolver {
	private runtime: FlowcraftRuntime
	private blueprints: Record<string, WorkflowBlueprint>

	constructor(runtime: FlowcraftRuntime, blueprints: Record<string, WorkflowBlueprint> = {}) {
		this.runtime = runtime
		this.blueprints = blueprints
	}

	async resolve(params: BlueprintResolveParams): Promise<BlueprintResolveResult> {
		if (!params.id) {
			throw new Error('Blueprint id is required for RegistryResolver')
		}

		const blueprint = this.blueprints[params.id]
		if (!blueprint) {
			throw new Error(`Blueprint not found in registry: ${params.id}`)
		}

		const version = params.version ?? blueprint.metadata?.version ?? 'latest'

		if (params.version && blueprint.metadata?.version !== params.version) {
			throw new Error(`Blueprint version not found: ${params.id}@${params.version}`)
		}

		return { blueprint, version }
	}

	addBlueprint(id: string, blueprint: WorkflowBlueprint): void {
		this.blueprints[id] = blueprint
	}
}

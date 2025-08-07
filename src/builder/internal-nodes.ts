import type { NodeArgs } from '../types'
import type { AbstractNode } from '../workflow'
import { Node } from '../workflow'
import { ParallelFlow } from './patterns'

/**
 * An internal node used by the GraphBuilder to handle the `inputs` mapping
 * of an inlined sub-workflow. It copies data from the parent context scope
 * to the sub-workflow's context scope.
 * @internal
 */
export class InputMappingNode extends Node {
	private mappings: Record<string, string>
	constructor(options: { data: Record<string, string> }) {
		super()
		// Exclude the injected nodeId from the mappings
		const { nodeId, ...mappings } = options.data
		this.mappings = mappings
	}

	async prep({ ctx, logger }: NodeArgs) {
		for (const [subKey, parentKey] of Object.entries(this.mappings)) {
			if (ctx.has(parentKey)) {
				ctx.set(subKey, ctx.get(parentKey))
			}
			else {
				logger.warn(`[InputMapper] Input mapping failed. Key '${parentKey}' not found in context.`)
			}
		}
	}
}

/**
 * An internal node used by the GraphBuilder to handle the `outputs` mapping
 * of an inlined sub-workflow. It copies data from the sub-workflow's
 * context scope back to the parent's context scope.
 * @internal
 */
export class OutputMappingNode extends Node {
	private mappings: Record<string, string>
	constructor(options: { data: Record<string, string> }) {
		super()
		// Exclude the injected nodeId from the mappings
		const { nodeId, ...mappings } = options.data
		this.mappings = mappings
	}

	async prep({ ctx, logger }: NodeArgs) {
		for (const [parentKey, subKey] of Object.entries(this.mappings)) {
			if (ctx.has(subKey)) {
				ctx.set(parentKey, ctx.get(subKey))
			}
			else {
				logger.warn(`[OutputMapper] Output mapping failed. Key '${subKey}' not found in context.`)
			}
		}
	}
}

/**
 * A private class used by the builder to represent the sub-workflow container itself.
 * It's a structural node that preserves the original node ID in the flattened graph.
 * @internal
 */
export class SubWorkflowContainerNode extends Node {
	constructor() {
		super()
		this.isPassthrough = true
	}

	async exec() {
		// This node performs no work; it just acts as a stable entry point.
		// The graph wiring ensures the InputMappingNode is executed next.
	}
}

/** A private class used by the builder to represent parallel execution blocks. */
export class ParallelBranchContainer extends ParallelFlow {
	/** A tag to reliably identify this node type in the visualizer. */
	public readonly isParallelContainer = true
	// This is now a public, mutable property for the executor to populate.
	public nodesToRun: AbstractNode[] = []

	constructor() {
		super() // Call the parent constructor, which can handle an empty/no-arg state.
		// semantic flag for distributed executors.
		this.isPassthrough = true
	}
}

/**
 * A private class used by the builder to unify conditional branches
 * before they connect to a common successor. This ensures the successor
 * only has one predecessor, preventing false fan-in detection.
 * @internal
 */
export class ConditionalJoinNode extends Node {
	constructor() {
		super()
		this.isPassthrough = true // It performs no logic, just structural
	}
}

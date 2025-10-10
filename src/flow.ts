import type { EdgeDefinition, NodeClass, NodeDefinition, NodeFunction, WorkflowBlueprint } from './types'

/** A type guard to reliably distinguish a NodeClass from a NodeFunction. */
function isNodeClass(impl: NodeFunction | NodeClass): impl is NodeClass {
	return typeof impl === 'function' && !!impl.prototype?.exec
}

export class Flow {
	private blueprint: Partial<WorkflowBlueprint>
	private functionRegistry: Map<string, NodeFunction | NodeClass>

	constructor(id: string) {
		this.blueprint = { id, nodes: [], edges: [] }
		this.functionRegistry = new Map()
	}

	node(id: string, implementation: NodeFunction | NodeClass, params?: Record<string, any>): this {
		let usesKey: string

		if (isNodeClass(implementation)) {
			// Use the class name if available and not a generic name, otherwise generate a stable key.
			// This is robust against minification and anonymous classes.
			usesKey = (implementation.name && implementation.name !== 'BaseNode')
				? implementation.name
				: `class_${id}_${this.functionRegistry.size}`
			this.functionRegistry.set(usesKey, implementation)
		}
		else {
			// For functions, we generate a unique key and store the implementation locally.
			usesKey = `fn_${id}_${this.functionRegistry.size}`
			this.functionRegistry.set(usesKey, implementation)
		}

		const nodeDef: NodeDefinition = { id, uses: usesKey, params }
		this.blueprint.nodes!.push(nodeDef)
		return this
	}

	edge(source: string, target: string, options?: { action?: string, condition?: string }): this {
		const edgeDef: EdgeDefinition = { source, target, ...options }
		this.blueprint.edges!.push(edgeDef)
		return this
	}

	// --- High-Level Pattern Stubs ---
	batch(source: string, target: string, worker: any, options?: any): this {
		// TODO: Implement logic to generate a 'batch-processor' node and edges.
		console.warn('`.batch()` is not yet implemented.')
		return this
	}

	loop(startNode: string, endNode: string, options?: any): this {
		// TODO: Implement logic to generate a 'loop-controller' node and edges.
		console.warn('`.loop()` is not yet implemented.')
		return this
	}

	toBlueprint(): WorkflowBlueprint {
		if (!this.blueprint.nodes || this.blueprint.nodes.length === 0) {
			throw new Error('Cannot build a blueprint with no nodes.')
		}
		return this.blueprint as WorkflowBlueprint
	}

	getFunctionRegistry() {
		return this.functionRegistry
	}
}

/** Helper function to create a new Flow builder instance. */
export function createFlow(id: string): Flow {
	return new Flow(id)
}

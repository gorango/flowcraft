import type { PortDefinition } from '../shapes/types'
import { functionNodeDef } from './nodeDefinitions/function'
import { sleepNodeDef } from './nodeDefinitions/sleep'
import { waitNodeDef } from './nodeDefinitions/wait'
import { webhookNodeDef } from './nodeDefinitions/webhook'
import { subflowNodeDef } from './nodeDefinitions/subflow'
import { batchScatterNodeDef } from './nodeDefinitions/batch-scatter'
import { batchGatherNodeDef } from './nodeDefinitions/batch-gather'
import { loopControllerNodeDef } from './nodeDefinitions/loop-controller'

export type FieldType = 'string' | 'number' | 'boolean' | 'json' | 'select'

export interface FieldDefinition {
	type: FieldType
	label: string
	defaultValue?: any
	options?: string[]
	placeholder?: string
}

export interface NodeTypeDefinition {
	type: string
	label: string
	description: string
	category: 'execution' | 'control' | 'trigger' | 'flow' | 'custom'
	inputs: PortDefinition[]
	outputs: PortDefinition[]
	defaultParams: Record<string, any>
	defaultInputs: Record<string, string> | string
	schema: Record<string, FieldDefinition>
}
const nodeTypeRegistry = new Map<string, NodeTypeDefinition>()

const builtInTypes: NodeTypeDefinition[] = [
	functionNodeDef,
	sleepNodeDef,
	waitNodeDef,
	webhookNodeDef,
	subflowNodeDef,
	batchScatterNodeDef,
	batchGatherNodeDef,
	loopControllerNodeDef,
]

for (const def of builtInTypes) {
	nodeTypeRegistry.set(def.type, def)
}

export function getNodeTypeDefinition(uses: string): NodeTypeDefinition | undefined {
	return nodeTypeRegistry.get(uses)
}

export function getAllNodeTypeDefinitions(): NodeTypeDefinition[] {
	return Array.from(nodeTypeRegistry.values())
}

export function getCategoryDefinitions(): Map<string, NodeTypeDefinition[]> {
	const categories = new Map<string, NodeTypeDefinition[]>()
	for (const [, def] of nodeTypeRegistry) {
		const existing = categories.get(def.category) ?? []
		existing.push(def)
		categories.set(def.category, existing)
	}
	return categories
}

export function registerNodeTypeDefinition(def: NodeTypeDefinition): void {
	nodeTypeRegistry.set(def.type, def)
}

import type { NodeTypeDefinition } from '../nodeTypes'

export const waitNodeDef: NodeTypeDefinition = {
	type: 'wait',
	label: 'Wait',
	description: 'Pauses workflow for external input (approval)',
	category: 'control',
	inputs: [{ id: 'wait-in', type: 'input', label: 'in' }],
	outputs: [{ id: 'wait-out', type: 'output', label: 'out' }],
	defaultParams: {},
	defaultInputs: {},
	schema: {},
}

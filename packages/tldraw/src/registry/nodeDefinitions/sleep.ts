import type { NodeTypeDefinition } from '../nodeTypes'

export const sleepNodeDef: NodeTypeDefinition = {
	type: 'sleep',
	label: 'Sleep',
	description: 'Pauses workflow execution for a specified duration',
	category: 'control',
	inputs: [{ id: 'sleep-in', type: 'input', label: 'in' }],
	outputs: [{ id: 'sleep-out', type: 'output', label: 'out' }],
	defaultParams: { duration: 1000 },
	defaultInputs: {},
	schema: {
		duration: {
			type: 'string',
			label: 'Duration',
			defaultValue: '1s',
		},
	},
}

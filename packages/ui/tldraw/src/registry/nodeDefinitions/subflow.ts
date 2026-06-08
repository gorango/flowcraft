import type { NodeTypeDefinition } from '../nodeTypes'

export const subflowNodeDef: NodeTypeDefinition = {
	type: 'subflow',
	label: 'Subflow',
	description: 'Executes another workflow blueprint as a sub-step',
	category: 'flow',
	inputs: [{ id: 'subflow-in', type: 'input', label: 'in' }],
	outputs: [{ id: 'subflow-out', type: 'output', label: 'out' }],
	defaultParams: { blueprintId: '' },
	defaultInputs: {},
	schema: {
		blueprintId: {
			type: 'string',
			label: 'Blueprint ID',
			defaultValue: '',
		},
	},
}

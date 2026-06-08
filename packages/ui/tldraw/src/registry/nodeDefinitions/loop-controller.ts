import type { NodeTypeDefinition } from '../nodeTypes'

export const loopControllerNodeDef: NodeTypeDefinition = {
	type: 'loop-controller',
	label: 'Loop Controller',
	description: 'Controls loop exit/continue condition',
	category: 'flow',
	inputs: [{ id: 'loop-in', type: 'input', label: 'in' }],
	outputs: [
		{ id: 'loop-continue-out', type: 'output', label: 'continue' },
		{ id: 'loop-break-out', type: 'output', label: 'break' },
	],
	defaultParams: { condition: '' },
	defaultInputs: {},
	schema: {
		condition: {
			type: 'string',
			label: 'Loop Condition',
			defaultValue: '',
		},
	},
}

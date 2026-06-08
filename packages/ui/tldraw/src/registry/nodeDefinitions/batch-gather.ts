import type { NodeTypeDefinition } from '../nodeTypes'

export const batchGatherNodeDef: NodeTypeDefinition = {
	type: 'batch-gather',
	label: 'Batch Gather',
	description: 'Collects results from parallel batch workers',
	category: 'flow',
	inputs: [{ id: 'gather-in', type: 'input', label: 'worker' }],
	outputs: [{ id: 'gather-out', type: 'output', label: 'out' }],
	defaultParams: {
		outputKey: '',
		gatherNodeId: '',
	},
	defaultInputs: {},
	schema: {
		outputKey: {
			type: 'string',
			label: 'Output Context Key',
			defaultValue: '',
		},
	},
}

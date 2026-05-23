import type { NodeTypeDefinition } from '../nodeTypes'

export const batchScatterNodeDef: NodeTypeDefinition = {
	type: 'batch-scatter',
	label: 'Batch Scatter',
	description: 'Splits an array input into parallel worker executions',
	category: 'flow',
	inputs: [{ id: 'scatter-in', type: 'input', label: 'in' }],
	outputs: [{ id: 'scatter-out', type: 'output', label: 'worker' }],
	defaultParams: {
		workerUsesKey: '',
		outputKey: '',
		gatherNodeId: '',
		chunkSize: 10,
	},
	defaultInputs: {},
	schema: {
		workerUsesKey: {
			type: 'string',
			label: 'Worker Function Key',
			defaultValue: '',
		},
		outputKey: {
			type: 'string',
			label: 'Output Context Key',
			defaultValue: '',
		},
		chunkSize: {
			type: 'number',
			label: 'Chunk Size',
			defaultValue: 10,
		},
	},
}

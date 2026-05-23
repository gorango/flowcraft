import type { NodeTypeDefinition } from '../nodeTypes'

export const functionNodeDef: NodeTypeDefinition = {
	type: 'custom',
	label: 'Function',
	description: 'A custom function node that runs user-defined code',
	category: 'execution',
	inputs: [{ id: 'in', type: 'input', label: 'in' }],
	outputs: [{ id: 'out', type: 'output', label: 'out' }],
	defaultParams: {},
	defaultInputs: {},
	schema: {},
}

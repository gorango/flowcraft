import type { NodeTypeDefinition } from '../nodeTypes'

export const webhookNodeDef: NodeTypeDefinition = {
	type: 'webhook',
	label: 'Webhook',
	description: 'Receives external HTTP/webhook data',
	category: 'trigger',
	inputs: [{ id: 'webhook-in', type: 'input', label: 'in' }],
	outputs: [{ id: 'webhook-out', type: 'output', label: 'out' }],
	defaultParams: {},
	defaultInputs: {},
	schema: {
		url: {
			type: 'string',
			label: 'Webhook URL',
			defaultValue: '',
		},
		method: {
			type: 'select',
			label: 'HTTP Method',
			options: ['GET', 'POST', 'PUT', 'PATCH'],
			defaultValue: 'POST',
		},
	},
}

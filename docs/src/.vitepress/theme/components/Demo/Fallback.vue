<script setup>
import { createFlow } from 'flowcraft'

async function mockApiCall(name, delay, shouldFail = false) {
	await new Promise(resolve => setTimeout(resolve, delay))
	if (shouldFail) {
		throw new Error(`API call "${name}" failed.`)
	}
	const result = { data: `Data from ${name}` }
	return { output: result }
}

const failingApi = async () => mockApiCall('Failing', 500, true)
const fallbackApi = async () => mockApiCall('Fallback', 500)

const flow = createFlow('error-workflow')
	.node('start-error', async () => ({ output: 'start' }))
	.node('failing-node', failingApi, { config: { maxRetries: 2, fallback: 'fallback-node' } })
	.node('fallback-node', fallbackApi)
	.node('final-step', async () => ({ output: 'Workflow finished' }))
	.edge('start-error', 'failing-node')
	.edge('failing-node', 'final-step')

const positionsMap = {
	'start-error': { x: 0, y: 100 },
	'failing-node': { x: 220, y: 100 },
	'fallback-node': { x: 220, y: 230 },
	'final-step': { x: 440, y: 100 },
}
const typesMap = {
	'start-error': 'input',
	'failing-node': 'default',
	'fallback-node': 'default',
	'final-step': 'output',
}
</script>

<template>
	<div class="flowcraft-flow">
		<Flow :flow :positions-map :types-map />
	</div>
</template>
